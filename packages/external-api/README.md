<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - EXTERNAL API EXTENSION</h2>

<hr />

</div>

## Description

This package serves HTTP APIs intended for consumption by external tools (control planes,
dashboards, CLIs, scrapers), either on a dedicated HTTP server or on Theia's main HTTP server.

Serving external APIs on their own port keeps them independent of the main server's
frontend-oriented protections: in Electron deployments the main port is sealed by the Electron
security token (making endpoints on it unreachable for external processes), while in browser
deployments it is open. The dedicated external API server behaves identically on both
platforms and has its own explicit, preference-controlled protection.

### Preferences

The external API is configured through preferences. They configure the backend and therefore
apply per user: their maximum scope is the user scope, so they cannot be overridden in
workspace settings.

- `externalApi.delivery`: Whether and how the external API is served:
  - `off` (default): The external API is not served.
  - `samePort`: Serve on the same port as the backend. Note that in Electron deployments the
    main port requires the Electron security token, so the external API is not reachable for
    external processes in this mode.
  - `separatePort`: Serve on a dedicated port, configured via `externalApi.port`.
- `externalApi.port`: Port on which the external HTTP API is served. Only used with
  `separatePort` delivery.
- `externalApi.hostname`: Hostname or IP address the dedicated server binds to. Defaults to
  `localhost`; use `0.0.0.0` to accept remote connections. Only used with `separatePort`
  delivery.
- `externalApi.token`: Bearer token required to access protected external API endpoints
  (`Authorization: Bearer <token>`). When empty (default), the external API is served without
  verification.

The backend applies preference changes immediately: the server starts, restarts, moves between
delivery modes, or stops without requiring a restart.

### Contributing endpoints

Extensions contribute endpoints by binding an `ExternalApiContribution` in their backend module:

```typescript
@injectable()
export class MyExternalApi implements ExternalApiContribution {
    readonly path = '/api/my-feature';

    configure(router: express.Router): void {
        router.get('/', (request, response) => response.json({ ok: true }));
    }
}

bind(MyExternalApi).toSelf().inSingletonScope();
bind(ExternalApiContribution).toService(MyExternalApi);
```

When a token is configured, contributions are protected by bearer token verification.
A contribution with its own authentication scheme (e.g. OAuth) or one that is conventionally
public can opt out by declaring `unprotected = true`.

Contributions holding long-lived connections (e.g. server-sent event streams) can implement
the optional `onConfigChanged()` method, which is called whenever the server configuration
changes and the routing is rebuilt; they should close such connections there so that clients
reconnect against the new configuration.

### Security Considerations

- The token is stored in plain text in the user settings and transmitted as a bearer header.
  Use it to keep casual local processes out, not as a substitute for network-level security;
  prefer binding to `localhost` and use TLS-terminating reverse proxies for remote scenarios.
- Without a token, anyone who can reach the configured port can call all contributed endpoints.

## Additional Information

- [API documentation for `@theia/external-api`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_external-api.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
