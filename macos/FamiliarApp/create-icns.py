#!/usr/bin/env python3
import struct
import sys
from pathlib import Path

source = Path(sys.argv[1])
output = Path(sys.argv[2])
chunk_types = {
    16: b"icp4",
    32: b"icp5",
    64: b"icp6",
    128: b"ic07",
    256: b"ic08",
    512: b"ic09",
    1024: b"ic10",
}

chunks = []
for size, chunk_type in chunk_types.items():
    image = source / f"{size}.png"
    data = image.read_bytes()
    chunks.append(chunk_type + struct.pack(">I", len(data) + 8) + data)

body = b"".join(chunks)
output.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)
