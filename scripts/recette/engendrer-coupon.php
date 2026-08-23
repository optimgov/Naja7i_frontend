<?php
/**
 * engendrer-coupon.php — un coupon de recette, comme le back-office en émet.
 *
 *   php artisan tinker <chemin-vers-ce-fichier>      (depuis le dépôt backend)
 *
 * Il passe par `Coupon::engendrer()` — le MÊME tirage que le back-office, sur
 * le même alphabet sans caractère ambigu. Écrire un code en dur ici ferait
 * passer la recette sur un chemin que la production n'emprunte jamais, et le
 * jour où le générateur casse — il a déjà cassé une fois, rendant « NJ7- » à
 * chaque appel — la recette resterait verte.
 *
 * L'ÉMETTEUR EST UN VRAI COMPTE `finance` : `created_by` porte donc quelqu'un,
 * comme en production. Un coupon sans émetteur est un coupon qu'on ne sait pas
 * expliquer six mois plus tard.
 */

use App\Models\Coupon;
use App\Models\Plan;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\User;
use App\Tenancy\TenantContext;

app(TenantContext::class)->set(Tenant::where('kind', 'platform')->firstOrFail());

/*
 * ─────────────────────────────────────────────────────────────────────────
 * L'OFFRE LA PLUS COMPLÈTE QUI SE VEND — et surtout pas la première venue.
 *
 * Ce script prenait `Plan::active()->ordered()->first()`. Depuis l'arbitrage
 * D-CAT, le porteur du GRATUIT est une offre comme les autres, semée par le
 * même chemin, et il porte `position = 0` : « la première » était donc devenue
 * l'offre à 0 MAD. La recette du chemin de revenu émettait un coupon pour ce
 * que le compte possède déjà, et n'ouvrait aucune capacité payante.
 *
 * `enVente()` écarte le gratuit par construction — « le gratuit ne se vend
 * pas : il se reçoit » (ADR-0028). Et l'on prend la PLUS COMPLÈTE des offres
 * vendables, pas la moins chère : la recette doit pouvoir éprouver la boucle
 * entière, et seule « Session complète » compose la profondeur
 * (`remediation.plan`, `memory.sessions`, `mastery.detail`).
 *
 * On trie sur le NOMBRE DE CAPACITÉS, pas sur le prix : un tarif se change en
 * back-office sans déploiement, et ce script se mettrait alors à vendre autre
 * chose sans que personne ne le voie.
 * ─────────────────────────────────────────────────────────────────────────
 */
$plan = Plan::enVente()->get()
    ->sortByDesc(fn (Plan $p): int => count($p->capabilities ?? []))
    ->first();

if ($plan === null) {
    echo "ÉCHEC : aucune offre en vente. Lancez `php artisan db:seed --class=PlansSeeder`.\n";
    exit(1);
}

$emetteur = User::firstOrCreate(
    ['email' => 'recette.finance@naja7i.test'],
    ['password' => 'Recette-FRONT3-2026!', 'locale' => 'fr', 'status' => 'active'],
);

if ($emetteur->email_verified_at === null) {
    $emetteur->markEmailAsVerified();
}

$roleId = Role::where('code', 'finance')->whereNull('tenant_id')->value('id');

if ($roleId !== null && ! $emetteur->memberships()->where('role_id', $roleId)->exists()) {
    $emetteur->memberships()->create(['role_id' => $roleId]);
}

$coupon = Coupon::create([
    'code' => Coupon::engendrer(),
    'plan_id' => $plan->id,
    'valid_from' => now()->subMinute(),
    'valid_until' => now()->addYear(),
    'max_uses' => 1,
    'used_count' => 0,
    'status' => 'actif',
    'created_by' => $emetteur->id,
    'note' => 'Coupon de recette automatisée — aucun encaissement.',
]);

echo "  coupon {$coupon->code} pour « {$plan->name_fr} » ({$plan->price_cents} centimes)\n";
