// Hochladen nacheinander: je Tag erst die Fotos (prepare = neu kodieren, dann api.upload), dann EINE Erinnerung über
// api.createTimelineEntry. Schlägt ein Tag fehl, steht er in errors und der nächste Tag kommt dran. Schon angelegte
// Erinnerungen bleiben (auch nach Abbrechen); wer „nochmal“ drückt, gibt done (Set der erledigten Tage) mit - die werden
// übersprungen. signal: AbortSignal zum Abbrechen zwischen zwei Fotos.

export async function runImport({ plan, dogId, autorName, privat, titleFor, api, prepare, signal, onProgress, done = new Set() }) {
  const todo = plan.filter((day) => !done.has(day.date))
  const total = todo.reduce((sum, day) => sum + day.items.length, 0)
  const created = []
  const errors = []
  let uploaded = 0
  const report = () => onProgress?.({ done: uploaded, total })
  report()
  for (const day of todo) {
    if (signal?.aborted) return { created, errors, cancelled: true }
    const dayStart = uploaded
    try {
      const fotoUrls = []
      for (const item of day.items) {
        if (signal?.aborted) return { created, errors, cancelled: true }
        const file = await prepare(item)
        if (signal?.aborted) return { created, errors, cancelled: true }
        const { url } = await api.upload(file)
        fotoUrls.push(url)
        uploaded += 1
        report()
      }
      const entry = await api.createTimelineEntry({ dogId, autorName, datum: day.date, titel: titleFor(day.date), text: '', fotoUrls, privat })
      created.push({ date: day.date, entry })
    } catch (err) {
      errors.push({ date: day.date, message: err?.message || String(err) })
      uploaded = dayStart + day.items.length
      report()
    }
  }
  return { created, errors, cancelled: false }
}
