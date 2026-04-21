# Atlas dos Géneros Musicais

Visualização interativa da história e evolução dos géneros musicais. Explora 396 géneros e 514 ligações de influência e fusão numa aplicação web sem dependências de servidor.

## Funcionalidades

- **Grafo de rede** — força-dirigida com zoom, pan e física de partículas
- **Vista em árvore** — géneros organizados por categoria
- **Pesquisa** — busca full-text com suporte a diacríticos
- **Filtros** — por categoria e era histórica (Antiguidade → 2010–presente)
- **Painel de informação** — descrição, instrumentos, fusões e géneros relacionados
- **Exportação** — download dos dados em JSON

## Como usar localmente

O projeto é HTML/CSS/JS puro — basta servir os ficheiros com qualquer servidor HTTP local.

```bash
# Com Python
python -m http.server 8000

# Com Node.js (npx)
npx serve .

# Com VS Code
# Instalar extensão "Live Server" e clicar em "Go Live"
```

Abre `http://localhost:8000` no browser.

> **Nota:** Não abrir `index.html` directamente como ficheiro (`file://`). O fetch de `data.json` requer um servidor HTTP.

## Dependências

- [D3.js v7.8.5](https://d3js.org/) — carregado via CDN (cdnjs.cloudflare.com)
- [Google Fonts](https://fonts.google.com/) — Space Mono, Outfit (carregados via CSS)

Sem npm, sem build system, sem backend.

## Estrutura

```
atlas-musical/
├── index.html   — estrutura e meta tags
├── style.css    — design system e estilos
├── app.js       — lógica de visualização (D3, filtros, pesquisa)
└── data.json    — base de dados (396 nós, 514 ligações)
```

## Dados

`data.json` segue o esquema:

```json
{
  "nodes": [
    {
      "id": "blues",
      "name": "Blues",
      "category": "Blues",
      "era": "early20",
      "region": "EUA",
      "description": "...",
      "isFusion": false,
      "instruments": ["guitarra", "harmónica", "voz"]
    }
  ],
  "links": [
    { "source": "blues", "target": "rock", "type": "influence" }
  ]
}
```

**Tipos de ligação:** `parent`, `influence`, `fusion`

**Eras:** `ancient`, `medieval`, `classical`, `early20`, `mid20`, `late20`, `2000s`, `modern`

## Deploy

Qualquer serviço de hosting estático funciona:

- **GitHub Pages** — activar em Settings → Pages → branch `main` / pasta raiz
- **Netlify / Vercel** — arrastar a pasta para o dashboard
- **Cloudflare Pages** — ligar ao repositório Git

Recomenda-se servir com HTTPS e compressão gzip activada no servidor (reduz `data.json` de ~154 KB para ~40 KB).

## Licença

MIT
