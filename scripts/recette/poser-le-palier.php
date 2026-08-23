<?php
/**
 * poser-le-palier.php — DIRE, AVANT DE MESURER, CE QUE LE COMPTE PEUT FAIRE.
 *
 *   COMPTE_EMAIL=… PALIER=… php artisan tinker <ce-fichier> --env=<env>
 *
 *   PALIER = `essai`, ou le code d'une offre vendable (`decouverte-7j`,
 *            `preparation-30j`, `session-180j`).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE — M-016
 *
 * « Une recette mesure un palier, pas un compte. » Avant ce lot, chaque
 * scénario héritait du palier que les précédents avaient laissé au compte A :
 * FRONT-4, l'examen blanc et la file d'envoi jouaient sur un compte d'ESSAI
 * des fonctions devenues PAYANTES au lot 3A.9. FRONT-4 ne rougissait même pas,
 * il plantait — et l'on ne savait pas si c'était le lot ou la donnée.
 *
 * Ce script pose le palier, ou refuse. Après lui, le scénario sait sur quoi il
 * mesure, et il l'a dit à voix haute.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * IL POSE PAR LA VRAIE CHAÎNE, ET IL NE VA JAMAIS EN ARRIÈRE
 *
 * Poser les octrois en SQL ferait passer la recette sans jamais éprouver le
 * chemin réel — c'est le raisonnement de `valider-commande.php`, et il vaut
 * ici. On émet donc un coupon, on ouvre la commande par `CouponGateway` et on
 * l'honore par `AbonnementService` : le calcul d'échéance, la clôture de
 * l'essai et l'idempotence sont ceux du produit.
 *
 * ON NE REDESCEND JAMAIS D'UN PALIER, et ce n'est pas une limite de ce script :
 * c'est l'ADR-0033. `OffreGratuiteService::attribuer()` refuse un essai à qui
 * en a déjà reçu un ou a déjà converti, et les deux faits se lisent sur des
 * traces DURABLES, jamais sur un droit actif. Un essai clos ne se rouvre pas.
 *
 * La conséquence est une décision de conception, pas un contournement : **un
 * compte par palier**. Un script qui saurait rendre son essai à un compte
 * converti fabriquerait un état que le produit ne peut pas produire, et la
 * recette mesurerait alors une plateforme imaginaire.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * IL VÉRIFIE CE QU'IL A POSÉ
 *
 * Il relit l'état et les capacités par les MÊMES chemins que l'API —
 * `etatCommercial()` et `AccessGrant::capabilities()` — puis échoue si le
 * palier demandé n'est pas obtenu. Un script qui annonce ce qu'il a voulu
 * faire, et non ce qui est, laisse passer le jour où la règle change sous lui.
 */

use App\Contracts\AccessGrant;
use App\Models\Coupon;
use App\Models\Plan;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AbonnementService;
use App\Services\Paiement\CouponGateway;
use App\Tenancy\TenantContext;
use Illuminate\Support\Str;

$email = getenv('COMPTE_EMAIL') ?: '';
$palier = getenv('PALIER') ?: '';

/* Les comptes de recette portent ce domaine. Poser un palier — donc ouvrir des
 * droits — sur un vrai candidat est une chose qu'aucun script ne doit pouvoir
 * faire par erreur de frappe. Même garde que `fermer-les-droits.php`. */
if (! str_ends_with($email, '@naja7i.test')) {
    echo "ÉCHEC : COMPTE_EMAIL doit être une adresse de recette (@naja7i.test), reçu « {$email} ».\n";
    exit(1);
}

if ($palier === '') {
    echo "ÉCHEC : PALIER est requis — `essai` ou un code d'offre vendable.\n";
    exit(1);
}

app(TenantContext::class)->set(Tenant::where('kind', 'platform')->firstOrFail());

$user = User::where('email', $email)->first();

if ($user === null) {
    echo "ÉCHEC : le compte {$email} est absent.\n";
    exit(1);
}

$droits = app(AccessGrant::class);

/** Ce que le compte peut faire, lu comme l'API le lit. */
$capacites = fn (): array => $droits->capabilities($user->fresh());

// ───────────────────────────────────────────────────────────── essai

if ($palier === 'essai') {
    /*
     * L'ESSAI NE SE POSE PAS : IL SE CONSTATE.
     *
     * Il est attribué à l'inscription. S'il n'est plus là, c'est que ce compte
     * a converti ou consommé son droit — et le lui rendre serait précisément
     * l'état interdit. On refuse, et le message dit quoi faire : prendre un
     * compte neuf.
     */
    $etat = $user->etatCommercial();

    if ($etat !== 'essai') {
        echo "ÉCHEC : {$email} est en état « {$etat} », pas « essai ».\n";
        echo "  Un essai clos ne se rouvre jamais (ADR-0033). Ce scénario demande un compte NEUF.\n";
        exit(1);
    }

    echo "  palier posé : essai · {$email} · capacités : ".implode(', ', $capacites())."\n";
    exit(0);
}

// ──────────────────────────────────────────────────── un palier vendable

$offre = Plan::enVente()->where('code', $palier)->first();

if ($offre === null) {
    echo "ÉCHEC : aucune offre vendable ne porte le code « {$palier} ».\n";
    echo "  Lancez `php artisan db:seed --class=PlansSeeder --env=<env>`.\n";
    exit(1);
}

$attendues = app(\App\Support\CapabilityRegistry::class)
    ->assertCommercializable($offre->capabilities);

$manquantes = array_diff($attendues, $capacites());

/* IDEMPOTENT. Le compte porte déjà tout ce que ce palier ouvre : on ne
 * réachète pas. Une recette rejouée ne doit pas empiler les commandes, sans
 * quoi son journal devient illisible et son échéance dérive. */
if ($manquantes === []) {
    echo "  palier déjà en place : {$offre->code} · {$email} · rien à faire\n";
    exit(0);
}

/* Le valideur de recette : un membre du rôle `finance`, qui porte
 * `orders.validate`. Copié de `valider-commande.php`, et pour la même raison —
 * la piste d'audit financière reste vraie même en recette. */
$valideur = User::firstOrCreate(
    ['email' => 'recette.finance@naja7i.test'],
    ['password' => 'Recette-FRONT3-2026!', 'locale' => 'fr', 'status' => 'active'],
);

if ($valideur->email_verified_at === null) {
    $valideur->markEmailAsVerified();
}

$roleId = Role::where('code', 'finance')->whereNull('tenant_id')->value('id');

if ($roleId !== null && ! $valideur->memberships()->where('role_id', $roleId)->exists()) {
    $valideur->memberships()->create(['role_id' => $roleId]);
}

$coupon = Coupon::create([
    'code' => Coupon::engendrer(),
    'plan_id' => $offre->id,
    'valid_from' => now()->subMinute(),
    'valid_until' => now()->addYear(),
    'max_uses' => 1,
    'used_count' => 0,
    'status' => 'actif',
    'created_by' => $valideur->id,
    'note' => 'Palier de recette posé par poser-le-palier.php — aucun encaissement.',
]);

/* `CouponGateway` puis `AbonnementService` : les deux moitiés du chemin réel.
 * La première juge l'éligibilité et fige le montant, la seconde clôt l'essai
 * puis octroie. Ni l'une ni l'autre n'est court-circuitée. */
$commande = app(CouponGateway::class)->ouvrir(
    $user,
    ['code' => $coupon->code],
    (string) Str::uuid7(),
);

app(AbonnementService::class)->honorer($commande, $valideur);

$obtenues = $capacites();
$toujoursManquantes = array_diff($attendues, $obtenues);

if ($toujoursManquantes !== []) {
    echo "ÉCHEC : après l'achat, il manque encore : ".implode(', ', $toujoursManquantes)."\n";
    exit(1);
}

echo "  palier posé : {$offre->code} · {$email} · état = ".$user->fresh()->etatCommercial()."\n";
echo '  capacités : '.implode(', ', $obtenues)."\n";
