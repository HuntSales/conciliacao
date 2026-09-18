# Identidade visual — Multi MCPs

Referência única do projeto. Toda tela nova segue este documento.

## Princípios

Tom direto e imperativo. Frases curtas. Sem emojis. Cantos retos ou cortados.
Nada de border-radius agressivo. Fundo escuro, acento laranja industrial.

## Paleta

| Uso                    | Hex                    | Token                    |
| ---------------------- | ---------------------- | ------------------------ |
| Fundo                  | #0A0A0A                | `--background`           |
| Superfície             | #111111                | `--surface`              |
| Card                   | #161616                | `--card`                 |
| Acento primário        | #FF5A1F                | `--primary`              |
| Laranja quente (hover) | #FF3A00                | `--primary-hot`          |
| Glow laranja           | rgba(255,90,31,0.18)   | utilitário `glow-orange` |
| Texto principal        | #F5F5F0                | `--foreground`           |
| Texto corpo            | #D8D8D0                | `--body`                 |
| Texto secundário       | #888880                | `--muted-foreground`     |
| Borda                  | #2A2A2A                | `--border`               |
| Borda suave            | rgba(255,255,255,0.08) | `--border-soft`          |
| Dourado (detalhe)      | #E8C86A                | `--gold`                 |

Todos os valores vivem em `src/styles.css` em oklch e são mapeados no `@theme inline`.
Nunca escreva cor crua em componente.

## Tipografia

Carregada via `<link>` do Google Fonts no root (`src/routes/__root.tsx`).

- **Bebas Neue** — títulos display. Classe `.display`. Sempre uppercase, line-height 0.92.
- **Archivo** — rótulos, botões e chips. Uppercase com letter-spacing alto. Classe `.chip`.
- **Syne** — subtítulos e headings secundários. Classes `.heading` e `.lbl`.
- **DM Sans** — corpo de texto. 16px, line-height 1.65. Fonte padrão do body.

## Componentes

### Botões

Trapézio via `clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)`
(utilitário `.trapezio`).

- `variant="corp"` — primário laranja com glow.
- `variant="corpOutline"` — borda laranja translúcida.
- `variant="ghostCorp"` — texto puro, hover laranja.

### Cards

Fundo `#161616`, borda sutil. No hover: borda laranja e linha de acento vertical
à esquerda. Utilitários `.corp-card` e `.corp-card-hover`.

### Overlays

- Grid sutil de 60px: `.grid-overlay`
- Vinheta escura: `.vinheta`
- Glow radial laranja: `.glow-orange`
- Ruído fixo: aplicado em `body::after`

### Animação

- Entrada: `.fade-up`
- Scroll: `.reveal` + `.reveal-in` (via `useReveal`)

## Estados vazios

Sem dados fictícios. Todo estado vazio usa o componente `EmptyState`: ícone
contornado, título em `.heading`, uma linha de instrução e a ação primária.
