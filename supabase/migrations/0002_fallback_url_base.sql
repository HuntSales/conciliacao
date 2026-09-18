-- Base URL do fallback REST direto (só usada quando o MCP não tem a tool da
-- função). Para Asaas é ignorada: a base é fixa por ambiente (produção/sandbox).
alter table credenciais_fallback add column if not exists url_base text;
