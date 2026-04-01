const { Client } = require('pg')
const crypto = require('crypto')

async function main() {
  const c = new Client({
    host: '192.168.178.24',
    port: 5432,
    user: 'Helper',
    password: 'Helper',
    database: 'wikijs'
  })

  await c.connect()

  const source = await c.query(
    `select path, title, description, content, render, toc, "contentType", "editorKey", extra
     from pages
     where "localeCode" = 'en' and path like 'wissen/%'
     order by path`
  )

  let inserted = 0
  const now = new Date().toISOString()

  for (const row of source.rows) {
    const exists = await c.query(
      'select id from pages where path = $1 and "localeCode" = $2 limit 1',
      [row.path, 'de']
    )
    if (exists.rowCount > 0) continue

    const hash = crypto.createHash('md5').update(`${row.path}:de:${row.title}`).digest('hex')

    await c.query(
      `insert into pages (
        path, hash, title, description, "isPrivate", "isPublished", "privateNS",
        "publishStartDate", "publishEndDate", content, render, toc, "contentType",
        "createdAt", "updatedAt", "editorKey", "localeCode", "authorId", "creatorId", extra
      ) values (
        $1, $2, $3, $4, false, true, '', '', '', $5, $6, $7, $8,
        $9, $9, $10, 'de', 1, 1, $11
      )`,
      [
        row.path,
        hash,
        row.title,
        row.description || '',
        row.content || '',
        row.render || '',
        row.toc || '[]',
        row.contentType || 'markdown',
        now,
        row.editorKey || 'markdown',
        row.extra || '{}'
      ]
    )
    inserted++
  }

  const links = await c.query(
    `select path, title from pages where "localeCode"='de' and path like 'wissen/%' order by path`
  )

  const home = await c.query(
    `select id, content, render from pages where "localeCode"='de' and path='home' limit 1`
  )

  let homeLinked = false
  if (home.rowCount > 0) {
    const h = home.rows[0]
    if (!(h.content || '').includes('## Testseiten (Auto DE)')) {
      const mdList = links.rows.map((l, idx) => `${idx + 1}. [${l.title}](/de/${l.path})`).join('\n')
      const htmlList = links.rows.map((l) => `<li><a href="/de/${l.path}">${l.title}</a></li>`).join('')
      const newContent = `${h.content || ''}\n\n## Testseiten (Auto DE)\n\n${mdList}\n`
      const newRender = `${h.render || ''}<h2>Testseiten (Auto DE)</h2><ol>${htmlList}</ol>`
      await c.query(
        'update pages set content = $1, render = $2, "updatedAt" = $3 where id = $4',
        [newContent, newRender, now, h.id]
      )
      homeLinked = true
    }
  }

  console.log(JSON.stringify({
    copiedToDe: inserted,
    deWissenCount: links.rowCount,
    deHomeLinked: homeLinked
  }, null, 2))

  await c.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
