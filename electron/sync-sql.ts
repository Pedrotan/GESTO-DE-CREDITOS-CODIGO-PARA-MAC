import { RENDERER_SQL_BY_ID } from './renderer-sql-allowlist.ts';
import { RENDERER_SQL_LEGACY_BY_ID } from './renderer-sql-legacy.ts';

/**
 * Comandos que se aceitam nas alterações recebidas da nuvem: os desta versão e os de escrita das versões anteriores
 * (enviados por computadores ou navegadores que ainda não actualizaram). Nunca serve para executar SQL do renderer.
 */
export const SYNC_SQL_BY_ID = new Map<string, string>([...RENDERER_SQL_LEGACY_BY_ID, ...RENDERER_SQL_BY_ID]);
