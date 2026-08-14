/**
 * `/fr/calendrier` et `/ar/calendrier`.
 *
 * LE PRÉFIXE DE LANGUE EST CONSERVÉ : un visiteur arabophone qui suit un vieux
 * lien ne doit pas atterrir en français. Un préfixe inconnu retombe sur la
 * cible sans préfixe, où i18n choisira — plutôt que de fabriquer `/zz/…`.
 */
export default defineEventHandler((event) => {
  const langue = getRouterParam(event, 'langue') ?? null
  return versLeTapis(event, langue)
})
