<?php
/**
 * valider-commande.php — CE QUE FAIT L'ÉQUIPE EN BACK-OFFICE, joué par script.
 *
 *   php artisan tinker <chemin-vers-ce-fichier>      (depuis le dépôt backend)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IL APPELLE LE SERVICE, PAS LA BASE
 *
 * `AbonnementService::honorer()` — exactement ce que le bouton « Valider » de
 * Filament appelle. Poser les octrois directement en SQL depuis ce script
 * ferait passer la recette sans jamais éprouver le chemin réel : le calcul de
 * l'échéance, la prolongation qui empile, l'idempotence. La recette
 * mesurerait alors sa propre écriture.
 *
 * LE VALIDATEUR EST UN VRAI COMPTE, avec la permission `orders.validate` : la
 * commande porte `validated_by`, et la piste d'audit financière reste vraie
 * même en recette. Un `null` ici masquerait la moitié de ce qu'on vérifie.
 * ─────────────────────────────────────────────────────────────────────────
 */

use App\Models\Order;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AbonnementService;
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

$candidat = User::where('email', $email)->first();

if ($candidat === null) {
    echo "ÉCHEC : le compte {$email} est absent.\n";
    exit(1);
}

$commande = Order::where('user_id', $candidat->id)
    ->where('status', 'en_attente')
    ->latest('id')
    ->first();

if ($commande === null) {
    echo "ÉCHEC : aucune commande en attente pour {$email}.\n";
    echo "  La recette doit saisir un coupon avant d'appeler ce script.\n";
    exit(1);
}

/* Le valideur de recette : un membre du rôle `finance`, qui porte
 * `orders.validate`. On le crée s'il manque — la base de recette est neuve à
 * chaque exécution en intégration continue. */
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

$honoree = app(AbonnementService::class)->honorer($commande, $valideur);

echo "  commande {$honoree->uuid} honorée par {$valideur->email}\n";
echo "  statut = {$honoree->status} · validée le {$honoree->validated_at}\n";
