"""ЗАГЛУШКА. Реальную версию (edge-tts) пишет Айкайнар.

synthesize_voice(text, voice_params, out_path) -> str (путь к mp3) или "" если не получилось.
voice_params = {name, rate, pitch} из style_engine.
"""
from __future__ import annotations


def synthesize_voice(text: str, voice_params: dict, out_path: str) -> str:
    try:
        import asyncio

        import edge_tts

        async def run() -> None:
            await edge_tts.Communicate(
                text, voice_params["name"], rate=voice_params["rate"], pitch=voice_params["pitch"]
            ).save(out_path)

        asyncio.run(run())
        return out_path
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning("edge-tts: %s: %s", type(e).__name__, e)
        if voice_params.get("_raise"):
            raise
        return ""
