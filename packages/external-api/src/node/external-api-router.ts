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

import { Disposable, DisposableCollection, MaybePromise } from '@theia/core';
import { ILogger } from '@theia/core/lib/common/logger';
import * as express from '@theia/core/shared/express';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ExternalApiEventStream, ExternalApiEventStreamFactory, ExternalApiEventStreamOptions } from './external-api-event-stream';
import { ExternalApiResponseRenderer } from './external-api-response-renderer';
import { RestResult } from './rest-result';

/** HTTP methods supported by the typed routes of the {@link ExternalApiRouter}. */
export type RestMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Options of a typed route, see {@link ExternalApiRouter}.
 */
export interface RestRouteOptions<B = unknown> {
    /**
     * Validates the request body, which is parsed as JSON when this guard is declared.
     * Bodies rejected by the guard — as well as malformed or too large JSON — are answered
     * with a client error in the uniform error format without invoking the handler.
     */
    body?: (body: unknown) => body is B;
    /** JSON body size limit of this route, e.g. '2mb'. Defaults to '1mb'. Only used together with {@link body}. */
    jsonLimit?: string;
}

/**
 * Request of a typed route handler, see {@link ExternalApiRouter}.
 */
export interface RestRequest<B = undefined> {
    /** Path parameters of the matched route, e.g. `id` for a route registered on `/:id`. */
    readonly params: Readonly<Record<string, string>>;
    /** The validated request body; `undefined` for routes without a body guard. */
    readonly body: B;
    /** The underlying express request, e.g. to access the query string or headers. */
    readonly raw: express.Request;
}

/**
 * Handler of a typed route: computes a {@link RestResult} for a {@link RestRequest}.
 * Thrown errors are logged and answered with `500` in the uniform error format.
 */
export type RestHandler<B = undefined> = (request: RestRequest<B>) => MaybePromise<RestResult>;

export const ExternalApiRouterOptions = Symbol('ExternalApiRouterOptions');
/**
 * Instantiation options of an {@link ExternalApiRouter}, provided by the external API server.
 */
export interface ExternalApiRouterOptions {
    /** Path under which the contribution's routes are mounted, used to give log messages context. */
    contributionPath: string;
    /** The underlying express router. */
    router: express.Router;
}

export const ExternalApiRouterFactory = Symbol('ExternalApiRouterFactory');
/** Creates the {@link ExternalApiRouter} passed to each `ExternalApiContribution`. */
export type ExternalApiRouterFactory = (options: ExternalApiRouterOptions) => ExternalApiRouter;

/**
 * Registers the routes of an `ExternalApiContribution`, taking care of the recurring endpoint
 * mechanics so that all contributions of the external API behave consistently:
 *
 * - Typed routes ({@link get}, {@link post}, ...) parse and validate JSON request bodies and
 *   render the handler's {@link RestResult} — including all error cases — through the
 *   {@link ExternalApiResponseRenderer}, giving all endpoints one wire format.
 * - {@link eventStream} serves server-sent events with connected-client management,
 *   keep-alive comments, and coalesced broadcasts.
 * - {@link raw} exposes the underlying express router as an escape hatch for routes the
 *   typed registration does not cover.
 *
 * A router is created for each routing build and disposed before the next build (on
 * configuration changes) and on shutdown: event streams are closed automatically, and
 * contributions register their own build-scoped resources — such as event listeners — in
 * {@link toDispose}.
 */
@injectable()
export class ExternalApiRouter implements Disposable {

    @inject(ILogger) @named('external-api:ExternalApiRouter')
    protected readonly logger: ILogger;

    @inject(ExternalApiRouterOptions)
    protected readonly options: ExternalApiRouterOptions;

    @inject(ExternalApiResponseRenderer)
    protected readonly renderer: ExternalApiResponseRenderer;

    @inject(ExternalApiEventStreamFactory)
    protected readonly eventStreamFactory: ExternalApiEventStreamFactory;

    /** Disposed when the routing is rebuilt or the external API server stops. */
    readonly toDispose = new DisposableCollection();

    /**
     * The underlying express router, mounted at the contribution's path behind the token
     * verification. Full-power escape hatch: existing express routers and middlewares can
     * be mounted here unchanged, keeping their own request handling and response format.
     * Errors they do not handle themselves are reduced to the uniform error format, and
     * their build-scoped resources belong in {@link toDispose}.
     */
    get raw(): express.Router {
        return this.options.router;
    }

    /** Registers a typed `GET` route. */
    get(path: string, handler: RestHandler<undefined>): void {
        this.route('get', path, undefined, handler);
    }

    /** Registers a typed `POST` route, validating the request body when a body guard is declared. */
    post(path: string, handler: RestHandler<undefined>): void;
    post<B>(path: string, options: RestRouteOptions<B>, handler: RestHandler<B>): void;
    post<B>(path: string, optionsOrHandler: RestRouteOptions<B> | RestHandler<undefined>, handler?: RestHandler<B>): void {
        this.registerRoute('post', path, optionsOrHandler, handler);
    }

    /** Registers a typed `PUT` route, validating the request body when a body guard is declared. */
    put(path: string, handler: RestHandler<undefined>): void;
    put<B>(path: string, options: RestRouteOptions<B>, handler: RestHandler<B>): void;
    put<B>(path: string, optionsOrHandler: RestRouteOptions<B> | RestHandler<undefined>, handler?: RestHandler<B>): void {
        this.registerRoute('put', path, optionsOrHandler, handler);
    }

    /** Registers a typed `PATCH` route, validating the request body when a body guard is declared. */
    patch(path: string, handler: RestHandler<undefined>): void;
    patch<B>(path: string, options: RestRouteOptions<B>, handler: RestHandler<B>): void;
    patch<B>(path: string, optionsOrHandler: RestRouteOptions<B> | RestHandler<undefined>, handler?: RestHandler<B>): void {
        this.registerRoute('patch', path, optionsOrHandler, handler);
    }

    /** Registers a typed `DELETE` route. */
    delete(path: string, handler: RestHandler<undefined>): void {
        this.route('delete', path, undefined, handler);
    }

    /**
     * Registers a `GET` route serving server-sent events. The returned stream manages the
     * connected clients (see {@link ExternalApiEventStream}) and is disposed with this
     * router, ending all client connections so that clients reconnect against a new
     * configuration.
     */
    eventStream<T>(path: string, options: ExternalApiEventStreamOptions<T>): ExternalApiEventStream<T> {
        const stream = this.eventStreamFactory(options);
        this.toDispose.push(stream);
        this.raw.get(path, (request, response) => stream.handle(request, response));
        return stream;
    }

    /**
     * Appends the fallback error handling that reduces unhandled route errors — including
     * malformed JSON bodies — to the uniform error format. Called by the external API server
     * once the contribution is configured, so that it runs after all contributed routes.
     */
    finalize(): void {
        this.raw.use((error: unknown, request: express.Request, response: express.Response, next: express.NextFunction) => {
            if (response.headersSent) {
                next(error);
                return;
            }
            const clientError = this.clientErrorStatus(error);
            if (clientError !== undefined) {
                this.renderer.renderError(clientError, 'invalid request', response);
            } else {
                this.logger.error(`Failed to serve a request below '${this.options.contributionPath}'.`, error);
                this.renderer.renderError(500, 'internal error', response);
            }
        });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected registerRoute<B>(method: RestMethod, path: string, optionsOrHandler: RestRouteOptions<B> | RestHandler<undefined>, handler?: RestHandler<B>): void {
        if (typeof optionsOrHandler === 'function') {
            this.route(method, path, undefined, optionsOrHandler);
        } else {
            this.route(method, path, optionsOrHandler, handler!);
        }
    }

    protected route<B>(method: RestMethod, path: string, options: RestRouteOptions<B> | undefined, handler: RestHandler<B>): void {
        const handlers: express.RequestHandler[] = [];
        if (options?.body) {
            handlers.push(express.json({ limit: options.jsonLimit ?? this.defaultJsonLimit }));
        }
        handlers.push(async (request, response) => {
            try {
                if (options?.body && !options.body(request.body)) {
                    this.renderer.renderError(400, 'invalid request', response);
                    return;
                }
                const result = await handler({ params: request.params, body: request.body as B, raw: request });
                this.renderer.render(result, response);
            } catch (error) {
                this.logger.error(`Failed to serve '${method.toUpperCase()} ${this.options.contributionPath}${path === '/' ? '' : path}'.`, error);
                if (!response.headersSent) {
                    this.renderer.renderError(500, 'internal error', response);
                }
            }
        });
        this.raw[method](path, ...handlers);
    }

    protected get defaultJsonLimit(): string {
        return '1mb';
    }

    /** Returns the HTTP status of client errors raised below the contribution's routes, e.g. by the JSON body parsing. */
    protected clientErrorStatus(error: unknown): number | undefined {
        const status = (error as { status?: unknown } | undefined)?.status;
        return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
    }
}
