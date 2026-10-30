#!/usr/bin/env python3
"""Copy selected nodes into an independent Fusion proxy configuration."""
import argparse
import os
from pathlib import Path
import tempfile

import yaml


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("nodes", nargs="+")
    args = parser.parse_args()
    source = yaml.safe_load(args.source.read_text())
    available = {node["name"]: node for node in source["proxies"]}
    missing = [name for name in args.nodes if name not in available]
    if missing:
        parser.error("Selected nodes are missing from the source configuration")
    config = {
        "mixed-port": 17892,
        "bind-address": "172.20.0.1",
        "allow-lan": True,
        "mode": "rule",
        "log-level": "warning",
        "ipv6": False,
        "proxies": [available[name] for name in args.nodes],
        "proxy-groups": [{
            "name": "FusionMedia",
            "type": "fallback",
            "proxies": args.nodes,
            "url": "https://i.imgur.com/removed.png",
            "interval": 60,
            "lazy": False,
        }],
        "rules": ["MATCH,FusionMedia"],
    }
    # Never rewrite the source or expose copied credentials in command output.
    destination = args.destination
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=destination.parent, delete=False) as output:
            temporary = Path(output.name)
            yaml.safe_dump(config, output, allow_unicode=True, sort_keys=False)
        os.replace(temporary, destination)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
