<?php
/**
 * fermer-les-droits.php — METTRE UN COMPTE DE RECETTE DANS L'ÉTAT `epuise`.
 *
 *   php artisan tinker <chemin-vers-ce-fichier> --env=<env>   (dépôt backend)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE FIXTURE EXISTE
 *
 * ADR-0033 définit trois états commerciaux, et la recette ne savait en poser
 * que deux. `essai` naît de l'inscription ; `actif` naît d'une commande
 * honorée, et `demo-abonnement.mjs` sait le faire. `epuise` — le troisième —
 * n'était atteignable qu'en attendant qu'un droit arrive à son terme.
 *
 * C'est justement l'état dont M-009 dit qu'il produit « le pire écran du
 * produit » s'il est mal servi : un compte devant une page vide, sans issue.
 * Un état qu'on ne sait pas poser est un état qu'on ne vérifie jamais.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS
 *
 * Il FERME les droits actifs : `ends_at` passe à l'instant précédent. C'est
 * exactement ce que le temps aurait fait, et `AccessGrantRecord::scopeActive`
 * les écarte alors comme il écarterait un droit venu à terme.
 *
 * Il NE SUPPRIME RIEN — ni tentative, ni correction, ni cause acquise, ni
 * rapport, ni score de maîtrise. C'est le sujet même de S-19 : l'expiration
 * ferme la restitution, elle ne détruit pas le passé. Un script qui effacerait
 * les droits au lieu de les clore mesurerait un compte neuf, pas un compte
 * épuisé, et la recette conclurait juste sur le mauvais objet.
 *
 * Il refuse tout compte dont l'adresse ne finit pas par `@naja7i.test` : les
 * comptes de recette portent ce domaine, et fermer les droits d'un vrai
 * candidat est une chose qu'aucun script ne doit pouvoir faire par erreur de
 * frappe.
 * ─────────────────────────────────────────────────────────────────────────
 */

use App\Models\AccessGrantRecord;
use App\Models\Tenant;
use App\Models\User;
use App\Tenancy\TenantContext;

$email = getenv('COMPTE_EMAIL') ?: '';

if (! str_ends_with($email, '@naja7i.test')) {
    echo "ÉCHEC : COMPTE_EMAIL doit être une adresse de recette (@naja7i.test), reçu « {$email} ».\n";
    exit(1);
}

app(TenantContext::class)->set(Tenant::where('kind', 'platform')->firstOrFail());

$user = User::where('email', $email)->first();

if ($user === null) {
    echo "ÉCHEC : le compte {$email} est absent.\n";
    exit(1);
}

$ferme = AccessGrantRecord::where('user_id', $user->id)
    ->active()
    ->update(['ends_at' => now()->subMinute()]);

/* On relit l'état par la MÊME méthode que l'API, plutôt que de l'affirmer :
 * un script qui annonce ce qu'il a voulu faire, et non ce qui est, laisse
 * passer le jour où la règle d'état change sous lui. */
$etat = $user->fresh()->etatCommercial();

echo "  {$ferme} droit(s) fermé(s) pour {$email} · état commercial : {$etat}\n";

if ($etat !== 'epuise') {
    echo "ÉCHEC : l'état attendu était « epuise ».\n";
    exit(1);
}
