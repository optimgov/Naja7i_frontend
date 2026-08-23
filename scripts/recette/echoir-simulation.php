<?php
/**
 * echoir-simulation.php — AVANCER L'HORLOGE D'UN EXAMEN BLANC, et rien d'autre.
 *
 *   php artisan tinker <chemin-vers-ce-fichier>      (depuis le dépôt backend)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SCRIPT EXISTE
 *
 * La recette doit éprouver le cas le plus important du simulateur : une réponse
 * qui arrive APRÈS l'échéance est refusée, et la tentative est close par le
 * serveur. L'épreuve de recette dure 240 minutes. Attendre n'est pas une
 * option, et raccourcir la durée du produit pour arranger le test serait
 * exactement ce que D-F39 interdit — modifier le produit pour qu'il ressemble
 * au test.
 *
 * On avance donc l'horloge de la TENTATIVE, comme `echoir-revisions.php`
 * avance celle du calendrier (D-F49). Même geste, même frontière.
 *
 * CE QU'IL NE TOUCHE PAS
 *
 * `expires_at` seulement, sur la simulation OUVERTE du compte nommé. Ni
 * `status`, ni `submitted_at`, ni `correct_count` : c'est le SERVEUR qui doit
 * clore, et toute la valeur du test est là. Poser `expired` à la main
 * vérifierait que la recette sait écrire en base, pas que le produit sait
 * fermer une épreuve.
 * ─────────────────────────────────────────────────────────────────────────
 */

use App\Models\Attempt;
use App\Models\Tenant;
use App\Models\User;
use App\Tenancy\TenantContext;

/*
 * AUCUN DÉFAUT DE COMPTE — M-016.
 *
 * Cette ligne portait `recette.a@naja7i.test`, un compte que la recette ne
 * prépare plus. Un défaut qui nomme un compte absent est un piège à deux
 * détentes : il masque l'oubli de la variable, et si ce compte survit d'une
 * base ancienne, la préparation réussit EN SILENCE sur le mauvais candidat.
 *
 * On refuse plutôt que de deviner. Même garde que `poser-le-palier.php`.
 */
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

$attempt = Attempt::where('user_id', $user->id)
    ->where('kind', 'simulation')
    ->where('status', 'in_progress')
    ->latest('id')
    ->first();

if ($attempt === null) {
    echo "ÉCHEC : aucun examen blanc ouvert pour {$email}.\n";
    echo "  La recette doit en ouvrir un avant d'appeler ce script.\n";
    exit(1);
}

/* Une minute dans le passé : franchement échu, sans ambiguïté de seconde. */
$attempt->update(['expires_at' => now()->subMinute()]);

echo "  simulation {$attempt->uuid} : échéance ramenée au passé\n";
echo "  (statut inchangé — c'est au serveur de clore, et c'est ce qu'on vérifie)\n";
