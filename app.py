"""Streamlit entry point for the Kondisi Laut Teluk Pemedas dashboard."""

from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


ROOT = Path(__file__).resolve().parent


@st.cache_data(show_spinner=False)
def build_dashboard_document() -> str:
    """Inline local assets so they work inside Streamlit's HTML component."""
    document = (ROOT / "index.html").read_text(encoding="utf-8")
    stylesheet = (ROOT / "style.css").read_text(encoding="utf-8")
    javascript = (ROOT / "app.js").read_text(encoding="utf-8")

    document = document.replace(
        '<link rel="stylesheet" href="style.css">',
        f"<style>\n{stylesheet}\n</style>",
    )
    document = document.replace(
        '<script src="app.js"></script>',
        f"<script>\n{javascript}\n</script>",
    )
    return document


st.set_page_config(
    page_title="Kondisi Laut Teluk Pemedas",
    page_icon="🌊",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
      [data-testid="stHeader"], [data-testid="stToolbar"], footer { display: none; }
      [data-testid="stAppViewContainer"] { background: #06121a; }
      [data-testid="stMainBlockContainer"] {
        max-width: none;
        padding: 0;
      }
      [data-testid="stIFrame"] {
        display: block;
        width: 100%;
        border: 0;
      }
    </style>
    """,
    unsafe_allow_html=True,
)

components.html(
    build_dashboard_document(),
    height=960,
    scrolling=True,
)
