"""Проявка API.

На бесплатном Render 512 МБ памяти и 0.1 CPU: один поток для numpy/numba/BLAS,
иначе каждый поток держит свои буферы и сервер падает по памяти.
"""
import os

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMBA_NUM_THREADS"):
    os.environ.setdefault(_v, "1")
