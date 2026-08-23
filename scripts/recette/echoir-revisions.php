<?php
/**
 * echoir-revisions.php — FAIRE PASSER LE TEMPS, et rien d'autre.
 *
 *   php artisan tinker <chemin-vers-ce-fichier>      (depuis le dépôt backend)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA PREMIÈRE EXÉCUTION EN INTÉGRATION CONTINUE A RÉVÉLÉ
 *
 * `recette-front4.mjs` éprouve la boucle quotidienne : les rendez-vous échus,
 * la séance de révision, le plafond annoncé. Elle passait sur un poste et
 * échouait sur une base neuve — « 0 échus, 0 servis », puis un clic dans le
 * vide sur un bouton d'ouverture de séance qui n'existait pas.
 *
 * Ce n'était ni un défaut du produit ni un défaut de la recette : c'était une
 * dépendance à l'ANCIENNETÉ de la base. Un rendez-vous naît au palier 1, donc
 * `due_on` = demain. Sur un poste, les comptes de recette traînent depuis des
 * jours et leurs rendez-vous sont échus depuis longtemps ; en CI la base a
 * quelques minutes et RIEN n'est jamais échu. La recette mesurait donc deux
 * choses différentes selon la machine — et la branche intéressante n'était
 * jouée nulle part de façon garantie.
 *
 * SIMULER LE TEMPS EST LA SEULE ISSUE. L'alternative est d'attendre un jour.
 *
 * CE QUE CE SCRIPT NE TOUCHE PAS, ET C'EST L'ESSENTIEL
 *
 * `due_on` seulement. Ni `palier`, ni `consecutive_sure`, ni `blind_error`, ni
 * `last_reviewed_at` : ceux-là encodent la PROGRESSION du candidat, et les
 * écrire ici fabriquerait un état que le produit n'a pas calculé. Reculer une
 * échéance, c'est avancer l'horloge ; toucher au palier, ce serait mentir sur
 * ce que le candidat a appris.
 *
 * Un seul compte est touché — celui qu'on lui nomme — et une seule épreuve.
 * ─────────────────────────────────────────────────────────────────────────
 */

use App\Models\Exam;
use App\Models\ReviewSchedule;
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
$codeEpreuve = getenv('CODE_EPREUVE') ?: 'CRMEF-FR-SPEC-2025';

app(TenantContext::class)->set(Tenant::where('kind', 'platform')->firstOrFail());

$user = User::where('email', $email)->first();

if ($user === null) {
    echo "ÉCHEC : le compte {$email} est absent. La préparation des comptes doit précéder.\n";
    exit(1);
}

$exam = Exam::where('code', $codeEpreuve)->first();

if ($exam === null) {
    echo "ÉCHEC : l'épreuve {$codeEpreuve} est absente.\n";
    exit(1);
}

/*
 * HIER, ET NON AUJOURD'HUI. Le scope `due` compare `due_on` à la date de
 * journée du candidat dans SON fuseau (`timezone_candidat`). Poser la date du
 * jour laisserait le résultat dépendre de l'heure à laquelle la CI tourne, à
 * cheval sur une frontière de journée ; hier est échu dans tous les fuseaux.
 * « En retard » est par ailleurs un état parfaitement légitime du produit —
 * `scopeDue` le dit explicitement.
 */
$hier = now(config('naja7i.timezone_candidat'))->subDay()->toDateString();

$rendezVous = ReviewSchedule::where('user_id', $user->id)
    ->where('exam_id', $exam->id)
    ->get();

if ($rendezVous->isEmpty()) {
    echo "ÉCHEC : aucun rendez-vous de révision pour {$email} sur {$codeEpreuve}.\n";
    echo "  La passation du diagnostic doit précéder, et elle doit produire des erreurs.\n";
    echo "  Zéro rendez-vous ici signifie que le calendrier mémoire n'a pas été alimenté.\n";
    exit(1);
}

$modifies = ReviewSchedule::where('user_id', $user->id)
    ->where('exam_id', $exam->id)
    ->update(['due_on' => $hier]);

echo "  calendrier : {$modifies} rendez-vous ramené(s) au {$hier} pour {$email}\n";
echo "  (seule l'échéance est reculée — palier, certitudes et erreur aveugle intacts)\n";
