"""
NextHyke Named Pipe Client (Python Worker Side)
Connects to Electron's Named Pipe server (\\\\.\\pipe\\NextHyke_Control_<PID>).
"""

import struct
import json
import time
from typing import Callable, Optional, Dict, Any, Tuple

PIPE_MAGIC = 0x48594B45  # "HYKE"
HEADER_FMT = "<IIII"  # magic, command_id, payload_size, sequence_id
HEADER_SIZE = struct.calcsize(HEADER_FMT)  # 16 bytes


class NamedPipeClient:
    """
    Win32 Named Pipe client for NextHyke inference worker.
    Handles message reception, command parsing, and response transmission.
    """

    def __init__(self, session_pid: int):
        self.session_pid = session_pid
        self.pipe_path = f"\\\\.\\pipe\\NextHyke_Control_{session_pid}"
        self.pipe_file = None
        self.is_connected = False
        self.sequence_id = 0

    def connect(self, timeout_sec: float = 10.0) -> bool:
        """Attempts to connect to the named pipe within the specified timeout."""
        start_time = time.time()
        while time.time() - start_time < timeout_sec:
            try:
                self.pipe_file = open(self.pipe_path, "r+b", buffering=0)
                self.is_connected = True
                return True
            except (FileNotFoundError, PermissionError):
                time.sleep(0.05)
            except Exception as e:
                time.sleep(0.05)
        return False

    def send_packet(self, command_id: int, payload: Dict[str, Any]) -> bool:
        """Sends a framed packet to the Electron main process."""
        if not self.is_connected or not self.pipe_file:
            return False

        try:
            payload_bytes = json.dumps(payload).encode("utf-8")
            self.sequence_id += 1
            header = struct.pack(
                HEADER_FMT,
                PIPE_MAGIC,
                command_id,
                len(payload_bytes),
                self.sequence_id
            )
            self.pipe_file.write(header + payload_bytes)
            self.pipe_file.flush()
            return True
        except Exception as e:
            self.is_connected = False
            return False

    def read_packet(self) -> Optional[Tuple[int, Dict[str, Any]]]:
        """
        Reads one framed packet from the pipe.
        Returns: (command_id, payload_dict) or None if disconnected.
        """
        if not self.is_connected or not self.pipe_file:
            return None

        try:
            header_bytes = self.pipe_file.read(HEADER_SIZE)
            if not header_bytes or len(header_bytes) < HEADER_SIZE:
                self.is_connected = False
                return None

            magic, command_id, payload_size, seq = struct.unpack(HEADER_FMT, header_bytes)
            if magic != PIPE_MAGIC:
                return None

            payload_bytes = b""
            if payload_size > 0:
                payload_bytes = self.pipe_file.read(payload_size)

            payload = {}
            if payload_bytes:
                payload = json.loads(payload_bytes.decode("utf-8"))

            return command_id, payload
        except Exception:
            self.is_connected = False
            return None

    def close(self):
        """Closes the pipe connection."""
        self.is_connected = False
        if self.pipe_file:
            try:
                self.pipe_file.close()
            except Exception:
                pass
            self.pipe_file = None
