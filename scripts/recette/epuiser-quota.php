<?php
/**
 * epuiser-quota.php — METTRE LE COMPTE DE RECETTE DEVANT LE MUR PAYANT.
 *
 *   php artisan tinker <chemin-vers-ce-fichier>      (depuis le dépôt backend)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE MIROIR DE `remettre-quota.php`, ET POUR LA MÊME RAISON
 *
 * La recette de l'abonnement doit constater que la cause est FERMÉE avant la
 * validation, puis OUVERTE après. Le « avant » n'est vrai que si le compte a
 * épuisé ses unités gratuites — sinon la première erreur ouvre sa cause avec le
 * quota, et la recette conclurait « le mur est tombé » en n'ayant mesuré que la
 * gratuité.
 *
 * Cet état dépendait jusqu'ici de ce que les recettes précédentes avaient
 * consommé, donc de l'ordre et de la machine. Ici on le POSE.
 *
 * On n'invente rien : le compteur est celui du produit, porté au plafond du
 * produit. Un candidat réel y arrive en lisant deux causes.
 * ─────────────────────────────────────────────────────────────────────────
 */

use App\Models\CauseRevealCounter;
use App\Models\Tenant;
use App\Models\User;
use App\Tenancy\TenantContext;

$email = getenv('COMPTE_EMAIL') ?: 'recette.a@naja7i.test';

app(TenantContext::class)->set(Tenant::where('kind', 'platform')->firstOrFail());

$user = User::where('email', $email)->first();

if ($user === null) {
    echo "ÉCHEC : le compte {$email} est absent.\n";
    exit(1);
}

$plafond = (int) config('naja7i.free_cause_quota');

$compteur = CauseRevealCounter::firstOrNew(['user_id' => $user->id]);
$avant = $compteur->revealed_total ?? 0;

$compteur->revealed_total = $plafond;
$compteur->first_revealed_at ??= now();
$compteur->last_revealed_at = now();
$compteur->save();

echo "  quota F03 épuisé pour {$email} : {$avant} → {$plafond} sur {$plafond}\n";
