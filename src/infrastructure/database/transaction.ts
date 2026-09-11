import type { Pool, PoolConnection } from "mysql2/promise";

export type TransactionWork<T> = (connection: PoolConnection) => Promise<T>;

export async function withTransaction<T>(
  pool: Pool,
  work: TransactionWork<T>,
): Promise<T> {
  const connection = await pool.getConnection();

  try {
    await connection.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");

    await connection.beginTransaction();

    const result = await work(connection);

    await connection.commit();

    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
