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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ExternalApiContribution } from '@theia/external-api/lib/node/external-api-contribution';
import { ExternalApiRouter } from '@theia/external-api/lib/node/external-api-router';
import { RestResult } from '@theia/external-api/lib/node/rest-result';
import { AI_SESSIONS_API_PATH, ExternalChatPrompt, ExternalChatSessionCreateRequest } from '../common/external-chat-session-provider';
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

    @inject(ExternalChatSessionRegistry)
    protected readonly registry: ExternalChatSessionRegistry;

    configure(router: ExternalApiRouter): void {
        router.get('/', async () => RestResult.ok({ sessions: await this.registry.getSessions() }));
        // register before '/:id' so that 'events' is not treated as a session id
        const events = router.eventStream('/events', {
            event: 'sessions',
            snapshot: async () => ({ sessions: await this.registry.getSessions() })
        });
        router.toDispose.push(this.registry.onDidChangeSessions(() => events.notifyChanged()));
        router.get('/:id', async ({ params }) => {
            const session = await this.registry.getSession(params.id);
            return session ? RestResult.ok(session) : RestResult.notFound();
        });
        router.post('/', { body: ExternalChatSessionCreateRequest.is }, ({ body }) => this.createSession(body));
        router.post('/:id/open', async ({ params }) =>
            await this.registry.openSession(params.id) ? RestResult.noContent() : RestResult.notFound());
        router.post('/:id/restore', async ({ params }) => {
            const session = await this.registry.restoreSession(params.id);
            return session ? RestResult.ok(session) : RestResult.notFound();
        });
        router.post('/:id/prompt', { body: ExternalChatPrompt.is }, ({ params, body }) => this.sendPrompt(params.id, body));
    }

    protected async createSession(request: ExternalChatSessionCreateRequest): Promise<RestResult> {
        const result = await this.registry.createSession(request);
        if ('created' in result) {
            return RestResult.created(result.created);
        }
        switch (result.failure) {
            case 'unknownAgent':
                return RestResult.badRequest('unknown agent');
            case 'noAgent':
                return RestResult.conflict('no agent available');
            case 'workspaceNotFound':
                return RestResult.notFound('workspace not found');
            case 'ambiguousWorkspace':
                return RestResult.conflict('ambiguous workspace');
        }
    }

    protected async sendPrompt(sessionId: string, prompt: ExternalChatPrompt): Promise<RestResult> {
        const result = await this.registry.sendPrompt(sessionId, prompt);
        if (!result) {
            return RestResult.notFound();
        }
        if ('sent' in result) {
            return RestResult.accepted(result.sent);
        }
        return RestResult.conflict(result.failure === 'busy' ? 'busy' : 'no agent available');
    }
}
