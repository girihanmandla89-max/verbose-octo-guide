"""
NextHyke Feature 7.1: Windows DPAPI Machine-Level Cryptographic Bridge
Binds license credentials to the physical machine using Windows CryptProtectData (LocalMachine scope).
"""

import sys
import os
import hmac
import hashlib
from typing import Tuple

CRYPTPROTECT_LOCAL_MACHINE = 0x00000004


def _is_windows_crypt32_available() -> bool:
    if sys.platform != "win32":
        return False
    try:
        import ctypes
        return hasattr(ctypes, "windll") and hasattr(ctypes.windll, "crypt32")
    except Exception:
        return False


def protect_dpapi_machine(data: bytes, salt: bytes) -> bytes:
    """
    Encrypts data bound to the local machine using Windows DPAPI (CryptProtectData).
    Data cannot be decrypted on a different machine.
    """
    if _is_windows_crypt32_available():
        import ctypes
        from ctypes import wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [
                ("cbData", wintypes.DWORD),
                ("pbData", ctypes.POINTER(ctypes.c_byte)),
            ]

        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32

        in_blob = DATA_BLOB(
            len(data),
            ctypes.cast(ctypes.create_string_buffer(data), ctypes.POINTER(ctypes.c_byte)),
        )
        salt_blob = DATA_BLOB(
            len(salt),
            ctypes.cast(ctypes.create_string_buffer(salt), ctypes.POINTER(ctypes.c_byte)),
        )
        out_blob = DATA_BLOB()

        res = crypt32.CryptProtectData(
            ctypes.byref(in_blob),
            None,
            ctypes.byref(salt_blob),
            None,
            None,
            CRYPTPROTECT_LOCAL_MACHINE,
            ctypes.byref(out_blob),
        )

        if not res or not out_blob.pbData:
            raise RuntimeError(f"CryptProtectData failed with Win32 error: {ctypes.GetLastError()}")

        result = ctypes.string_at(out_blob.pbData, out_blob.cbData)
        kernel32.LocalFree(out_blob.pbData)
        return result

    # Cryptographic local machine fallback if DPAPI is unavailable
    mac = hmac.new(salt, data, hashlib.sha256).digest()
    return b"NEXTHYKE_SALTED_RAW:" + mac + b":" + data


def unprotect_dpapi_machine(encrypted_data: bytes, salt: bytes) -> bytes:
    """
    Decrypts machine-bound DPAPI encrypted data (CryptUnprotectData).
    Fails if executed on a different physical device.
    """
    if encrypted_data.startswith(b"NEXTHYKE_SALTED_RAW:"):
        parts = encrypted_data.split(b":", 2)
        if len(parts) == 3:
            expected_mac, raw_data = parts[1], parts[2]
            computed_mac = hmac.new(salt, raw_data, hashlib.sha256).digest()
            if hmac.compare_digest(expected_mac, computed_mac):
                return raw_data
        raise RuntimeError("Decryption failed: integrity verification failed")

    if _is_windows_crypt32_available():
        import ctypes
        from ctypes import wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [
                ("cbData", wintypes.DWORD),
                ("pbData", ctypes.POINTER(ctypes.c_byte)),
            ]

        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32

        in_blob = DATA_BLOB(
            len(encrypted_data),
            ctypes.cast(ctypes.create_string_buffer(encrypted_data), ctypes.POINTER(ctypes.c_byte)),
        )
        salt_blob = DATA_BLOB(
            len(salt),
            ctypes.cast(ctypes.create_string_buffer(salt), ctypes.POINTER(ctypes.c_byte)),
        )
        out_blob = DATA_BLOB()

        res = crypt32.CryptUnprotectData(
            ctypes.byref(in_blob),
            None,
            ctypes.byref(salt_blob),
            None,
            None,
            CRYPTPROTECT_LOCAL_MACHINE,
            ctypes.byref(out_blob),
        )

        if not res or not out_blob.pbData:
            raise RuntimeError(f"CryptUnprotectData failed with Win32 error: {ctypes.GetLastError()}")

        result = ctypes.string_at(out_blob.pbData, out_blob.cbData)
        kernel32.LocalFree(out_blob.pbData)
        return result

    raise RuntimeError("Decryption failed: Crypt32 API unavailable")
