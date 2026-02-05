#!/usr/bin/env python3
"""
Start the VeloLift backend server.

Usage:
    python run_server.py
    python run_server.py --port 8080
    python run_server.py --reload
"""

import argparse
import uvicorn


def main():
    parser = argparse.ArgumentParser(description="VeloLift Backend Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    parser.add_argument("--log-level", default="info", help="Log level")

    args = parser.parse_args()

    print(f"""
    ╔═══════════════════════════════════════════════════════════╗
    ║           VeloLift Backend Server                    ║
    ╠═══════════════════════════════════════════════════════════╣
    ║  WebSocket endpoint: ws://{args.host}:{args.port}/ws              ║
    ║  API docs:           http://{args.host}:{args.port}/docs          ║
    ║  Health check:       http://{args.host}:{args.port}/api/health    ║
    ╚═══════════════════════════════════════════════════════════╝
    """)

    uvicorn.run(
        "backend.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level=args.log_level
    )


if __name__ == "__main__":
    main()
