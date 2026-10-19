"""
NextHyke Security & Anti-Tamper Subsystem
Windows DPAPI hardware binding and cryptographic security bridges.
"""

from src.engine.security.dpapi import protect_dpapi_machine, unprotect_dpapi_machine

__all__ = ["protect_dpapi_machine", "unprotect_dpapi_machine"]
