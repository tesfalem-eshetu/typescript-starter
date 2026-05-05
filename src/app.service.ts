import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  /**
   * Tiny HTML landing page rendered at GET /. The actual API lives under
   * /users and /events; this page just points the user at the Swagger
   * explorer so opening localhost:3000 in a browser is not confusing.
   */
  getLandingHtml(): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Events API</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        max-width: 640px;
        margin: 4rem auto;
        padding: 0 1rem;
        line-height: 1.6;
        color: #1a1a1a;
      }
      code {
        background: #f4f4f5;
        padding: 0.1em 0.4em;
        border-radius: 4px;
        font-size: 0.95em;
      }
      a { color: #2563eb; }
      ul { padding-left: 1.25rem; }
    </style>
  </head>
  <body>
    <h1>Events API</h1>
    <p>This is a JSON REST API. There is no UI here.</p>
    <p>
      Please use the interactive Swagger explorer to browse and try the
      endpoints: <a href="/api">http://localhost:3000/api</a>
    </p>
    <p>Endpoints:</p>
    <ul>
      <li><code>POST /users</code> &mdash; create a user</li>
      <li><code>GET /users/:id</code> &mdash; retrieve a user with their event ids</li>
      <li><code>POST /events</code> &mdash; create an event</li>
      <li><code>GET /events/:id</code> &mdash; retrieve an event with invitees</li>
      <li><code>DELETE /events/:id</code> &mdash; delete an event</li>
      <li><code>POST /users/:userId/events/merge</code> &mdash; merge overlapping events</li>
    </ul>
  </body>
</html>`;
  }
}
