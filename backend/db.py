"""DB 연결 풀 (Supabase Postgres / Supavisor 트랜잭션 풀러).

트랜잭션 풀러(pgbouncer 계열)에서는 prepared statement가 문제되므로 비활성화한다.
"""
from __future__ import annotations

from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from config import settings

pool = ConnectionPool(
    conninfo=settings.DATABASE_URL,
    min_size=1,
    max_size=8,
    kwargs={"prepare_threshold": None, "row_factory": dict_row, "autocommit": True},
    open=False,
)


def open_pool() -> None:
    if pool.closed:
        pool.open()


def close_pool() -> None:
    if not pool.closed:
        pool.close()


@contextmanager
def get_conn():
    with pool.connection() as conn:
        yield conn
