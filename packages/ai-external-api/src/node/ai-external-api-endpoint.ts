// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ILogger } from '@theia/core/lib/common/logger';
import * as express from '@theia/core/shared/express';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { ExternalApiContribution } from '@theia/external-api/lib/node/external-api-contribution';
import { AI_SESSIONS_API_PATH, ExternalChatPrompt, ExternalChatSessionCreateRequest, ExternalChatSessionSummary } from '../common/external-chat-session-provider';
import { ExternalChatSessionRegistry } from './external-chat-session-registry';

/**
 * Contributes the AI session API to the external API server:
 * - `GET /api/ai/sessions` lists all sessions (restored and persisted) with id, title, status,
 *   agent, workspace, last interaction time, and a short plain-text preview of the conversation.
 * - `POST /api/ai/sessions` creates a session in a frontend matching the requested workspace,
 *   optionally pinning an agent and sending an initial prompt.
 * - `GET /api/ai/sessions/events` streams the session list as server-sent events, pushing an
 *   updated list whenever sessions change.
 * - `GET /api/ai/sessions/:id` returns a single session including its conversation reduced to
 *   plain-text messages (persisted sessions report metadata only until restored).
 * - `POST /api/ai/sessions/:id/open` shows the session in the chat view of a connected frontend.
 * - `POST /api/ai/sessions/:id/restore` restores a persisted session and returns its detail.
 * - `POST /api/ai/sessions/:id/prompt` sends a prompt to the session.
 *
 * The endpoints are served on the external API port and are token-protected when an
 * external API token is configured (see `@theia/external-api`).
 */
@injectable()
export class AIExternalApiEndpoint implements ExternalApiContribution {

    readonly path = AI_SESSIONS_API_PATH;

    /** Delay in milliseconds by which change broadcasts are coalesced. */
    protected readonly broadcastDelay = 100;
    /** Interval in milliseconds of the keep-alive comments sent to event stream clients. */
    protected readonly heartbeatInterval = 30000;

    @inject(ILogger) @named('ai-external-api:AIExternalApiEndpoint')
    protected readonly logger: ILogger;

    @inject(ExternalChatSessionRegistry)
    protected readonly registry: ExternalChatSessionRegistry;

    /** Open server-sent event streams, one per connected client. */
    protected readonly eventClients = new Set<express.Response>();
    protected heartbeatTimer?: NodeJS.Timeout;
    protected broadcastTimer?: NodeJS.Timeout;

    @postConstruct()
    protected init(): void {
        this.registry.onDidChangeSessions(() => this.scheduleBroadcast());
    }

    configure(router: express.Router): void {
        router.use(express.json({ limit: '1mb' }));
        router.get('/', (request, response) => this.handleGetSessions(response));
        router.post('/', (request, response) => this.handleCreateSession(request.body, response));
        // register before '/:id' so that 'events' is not treated as a session id
        router.get('/events', (request, response) => this.handleGetEvents(response));
        router.get('/:id', (request, response) => this.handleGetSession(request.params.id, response));
        router.post('/:id/open', (request, response) => this.handleOpenSession(request.params.id, response));
        router.post('/:id/restore', (request, response) => this.handleRestoreSession(request.params.id, response));
        router.post('/:id/prompt', (request, response) => this.handleSendPrompt(request.params.id, request.body, response));
        // reduce body parser failures (malformed JSON, too large) to the API's error format
        router.use((error: unknown, request: express.Request, response: express.Response, next: express.NextFunction) => {
            if (response.headersSent) {
                next(error);
            } else {
                response.status(400).json({ error: 'invalid request' });
            }
        });
    }

    /** Closes all event streams so that clients reconnect against the new configuration. */
    onConfigChanged(): void {
        const clients = Array.from(this.eventClients);
        this.eventClients.clear();
        this.stopTimers();
        for (const client of clients) {
            client.end();
        }
    }

    protected async handleGetSessions(response: express.Response): Promise<void> {
        try {
            response.json({ sessions: await this.registry.getSessions() });
        } catch (error) {
            this.handleError(response, error);
        }
    }

    protected async handleGetSession(sessionId: string, response: express.Response): Promise<void> {
        try {
            const session = await this.registry.getSession(sessionId);
            if (session) {
                response.json(session);
            } else {
                response.status(404).json({ error: 'not found' });
            }
        } catch (error) {
            this.handleError(response, error);
        }
    }

    protected async handleCreateSession(body: unknown, response: express.Response): Promise<void> {
        if (!this.isCreateRequest(body)) {
            response.status(400).json({ error: 'invalid request' });
            return;
        }
        try {
            const result = await this.registry.createSession(body);
            if ('created' in result) {
                response.status(201).json(result.created);
            } else {
                switch (result.failure) {
                    case 'unknownAgent':
                        response.status(400).json({ error: 'unknown agent' });
                        break;
                    case 'noAgent':
                        response.status(409).json({ error: 'no agent available' });
                        break;
                    case 'workspaceNotFound':
                        response.status(404).json({ error: 'workspace not found' });
                        break;
                    case 'ambiguousWorkspace':
                        response.status(409).json({ error: 'ambiguous workspace' });
                        break;
                }
            }
        } catch (error) {
            this.handleError(response, error);
        }
    }

    protected async handleSendPrompt(sessionId: string, body: unknown, response: express.Response): Promise<void> {
        if (!this.isPrompt(body)) {
            response.status(400).json({ error: 'invalid request' });
            return;
        }
        try {
            const result = await this.registry.sendPrompt(sessionId, body);
            if (!result) {
                response.status(404).json({ error: 'not found' });
            } else if ('sent' in result) {
                response.status(202).json(result.sent);
            } else {
                response.status(409).json({ error: result.failure === 'busy' ? 'busy' : 'no agent available' });
            }
        } catch (error) {
            this.handleError(response, error);
        }
    }

    protected isPrompt(body: unknown): body is ExternalChatPrompt {
        if (typeof body !== 'object' || !body) {
            return false;
        }
        const prompt = body as Record<keyof ExternalChatPrompt, unknown>;
        return typeof prompt.text === 'string' && prompt.text.trim().length > 0
            && (prompt.interrupt === undefined || typeof prompt.interrupt === 'boolean');
    }

    protected isCreateRequest(body: unknown): body is ExternalChatSessionCreateRequest {
        if (typeof body !== 'object' || !body) {
            return false;
        }
        const request = body as Record<keyof ExternalChatSessionCreateRequest, unknown>;
        const isOptionalText = (value: unknown): boolean => value === undefined || typeof value === 'string' && value.trim().length > 0;
        return isOptionalText(request.workspace)
            && isOptionalText(request.agentId)
            && isOptionalText(request.prompt)
            && (request.focus === undefined || typeof request.focus === 'boolean');
    }

    protected async handleOpenSession(sessionId: string, response: express.Response): Promise<void> {
        try {
            if (await this.registry.openSession(sessionId)) {
                response.status(204).end();
            } else {
                response.status(404).json({ error: 'not found' });
            }
        } catch (error) {
            this.handleError(response, error);
        }
    }

    protected async handleRestoreSession(sessionId: string, response: express.Response): Promise<void> {
        try {
            const session = await this.registry.restoreSession(sessionId);
            if (session) {
                response.json(session);
            } else {
                response.status(404).json({ error: 'not found' });
            }
        } catch (error) {
            this.handleError(response, error);
        }
    }

    protected async handleGetEvents(response: express.Response): Promise<void> {
        response.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        this.eventClients.add(response);
        if (!this.heartbeatTimer) {
            this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatInterval);
        }
        // swallow write errors of streams whose client vanished; 'close' removes them right after
        response.on('error', error => this.logger.debug('An event stream client connection failed.', error));
        response.on('close', () => {
            this.eventClients.delete(response);
            if (this.eventClients.size === 0) {
                this.stopTimers();
            }
        });
        try {
            this.sendSessions(response, await this.registry.getSessions());
        } catch (error) {
            this.logger.error('Failed to send the initial session list to an event stream client.', error);
            response.end();
        }
    }

    protected scheduleBroadcast(): void {
        if (this.eventClients.size === 0 || this.broadcastTimer) {
            return;
        }
        this.broadcastTimer = setTimeout(async () => {
            this.broadcastTimer = undefined;
            try {
                const sessions = await this.registry.getSessions();
                for (const client of this.eventClients) {
                    this.sendSessions(client, sessions);
                }
            } catch (error) {
                this.logger.warn('Failed to broadcast a session change to the event stream clients.', error);
            }
        }, this.broadcastDelay);
    }

    protected sendSessions(client: express.Response, sessions: ExternalChatSessionSummary[]): void {
        if (!client.destroyed) {
            client.write(`event: sessions\ndata: ${JSON.stringify({ sessions })}\n\n`);
        }
    }

    protected sendHeartbeat(): void {
        for (const client of this.eventClients) {
            if (!client.destroyed) {
                client.write(': keep-alive\n\n');
            }
        }
    }

    protected stopTimers(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
        if (this.broadcastTimer) {
            clearTimeout(this.broadcastTimer);
            this.broadcastTimer = undefined;
        }
    }

    protected handleError(response: express.Response, error: unknown): void {
        this.logger.error('Failed to serve an external AI session API request.', error);
        response.status(500).json({ error: 'internal error' });
    }
}
