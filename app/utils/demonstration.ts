/**
 * Une réponse 200 ne suffit pas à promettre une démonstration : elle doit
 * réellement porter une question et des choix exploitables.
 */
export function contientQuestionDemonstration(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false

  const question = Reflect.get(value, 'question')
  const options = Reflect.get(value, 'options')

  if (typeof question !== 'object' || question === null || !Array.isArray(options)) {
    return false
  }

  const uuid = Reflect.get(question, 'uuid')
  const stem = Reflect.get(question, 'stem')

  return typeof uuid === 'string'
    && uuid.trim().length > 0
    && typeof stem === 'string'
    && stem.trim().length > 0
    && options.length >= 2
}
