"""Loopback-only read API for the upcoming manual dashboard. No signing or transaction writes."""

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from check_monad_readiness import CONFIG, CheckError, rpc_endpoint
from dashboard_data import Dashboard, DashboardRpc


def route(model, path):
    parsed = urlsplit(path)
    query = parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True)
    if any(len(values) != 1 for values in query.values()):
        raise ValueError("Duplicate query parameter")
    args = {key: values[0] for key, values in query.items()}
    if parsed.path == "/api/state" and not set(args) - {"wallet", "claims"}:
        claims = None
        if "claims" in args:
            claims = [tuple(int(n) for n in item.split(":")) for item in args["claims"].split(",")]
            if any(len(item) != 2 for item in claims):
                raise ValueError("Claims must use scope:mask pairs")
        return model.snapshot(args.get("wallet"), claims)
    if parsed.path == "/api/quote" and set(args) == {"side", "scope", "mask", "quantity"}:
        return model.quote(args["side"], int(args["scope"]), int(args["mask"]), int(args["quantity"]))
    if parsed.path == "/api/transaction" and set(args) == {"hash"}:
        return model.transaction(args["hash"])
    raise ValueError("Unknown route or invalid query parameters")


def handler(factory):
    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, payload):
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            port = self.server.server_port
            hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
            if self.headers.get("Host") not in hosts or self.headers.get("Origin") not in (None, *[f"http://{h}" for h in hosts]):
                self.reply(403, {"error": "Local same-origin requests only"})
                return
            if len(self.path) > 4096:
                self.reply(400, {"error": "Request is too long"})
                return
            try:
                if self.path == "/api/health":
                    self.reply(200, {"service": "dashboard_data", "read_only": True, "chain_state": "not_checked"})
                else:
                    self.reply(200, route(factory(), self.path))
            except ValueError:
                self.reply(400, {"error": "Invalid request parameters"})
            except CheckError as error:
                self.reply(503, {"error": str(error), "status": "unavailable"})
            except Exception:
                self.reply(503, {"error": "Data/configuration unavailable; remote details withheld", "status": "unavailable"})

        def do_POST(self):
            self.reply(405, {"error": "Read-only API; transaction submission is not supported"})

        def log_message(self, format, *args):
            pass  # No wallet/query/RPC credentials in access logs.
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--provider", choices=("local", "public", "alchemy"), default="local")
    parser.add_argument("--port", type=int, default=18765)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Use a port between 1024 and 65535")
    network = json.loads(CONFIG.read_text())["networks"]["testnet"]
    endpoint = rpc_endpoint(network, args.provider, os.environ)

    def factory():
        return Dashboard(json.loads(args.manifest.read_text()), network, DashboardRpc(endpoint),
                         "local_fork" if args.provider == "local" else "public_testnet")

    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler(factory))
    print(f"Read-only dashboard API: http://127.0.0.1:{args.port}/api/health", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
