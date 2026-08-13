<?php
/**
 * preparer-referentiel.php — CE QUE L'API NE SAIT PAS ENCORE FAIRE, et rien d'autre.
 *
 *   php artisan tinker <chemin-vers-ce-fichier>      (depuis le dépôt backend)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE RÉSIDU EN `tinker`
 *
 * Le semis de la banque est passé à l'API au PAS-33 : `semer-banque.mjs` mène
 * chaque question du brouillon au publié par les routes de la chaîne
 * éditoriale, et rien d'autre. Trois choses lui manquent pourtant, et AUCUNE
 * n'a de point d'entrée HTTP — vérifié dans `routes/api.php` :
 *
 *   1. LES COMPTES DE PERSONNEL ET LEURS RÔLES. `auth/register` crée un
 *      candidat ; rattacher `auteur`, `reviseur` ou `editeur` n'a pas de route.
 *   2. LES REMÉDIATIONS. `QuestionIntegrityChecker::diagnosticIssues()` exige
 *      `remediation_id` pour publier au diagnostic. Aucune route ne crée ni ne
 *      lit de remédiation : elles ne sortent que par le plan de révision d'un
 *      candidat, ce qui supposerait un diagnostic déjà passé — circulaire.
 *   3. L'UUID DE LA SOURCE. `admin/sources/{uuid}/verify` prend un uuid, et
 *      aucune lecture ne le rend : `CompetencyNodeResource` et
 *      `QuestionAdminResource` ne citent la source que par son CODE.
 *
 * Ces trois-là sont du RÉFÉRENTIEL et du PERSONNEL, pas de la chaîne
 * éditoriale. Le semis, lui, ne touche plus à la base. La frontière est nette
 * et se relit d'un coup d'œil : ce fichier écrit un fichier de passation, il ne
 * crée aucune question.
 *
 * IDEMPOTENT : `firstOrCreate` partout, rejouable sur un poste comme en CI.
 * ─────────────────────────────────────────────────────────────────────────
 */

use App\Models\CompetencyNode;
use App\Models\Exam;
use App\Models\Remediation;
use App\Models\Role;
use App\Models\Source;
use App\Models\Tenant;
use App\Models\User;
use App\Tenancy\TenantContext;

const CODE_EPREUVE = 'CRMEF-FR-SPEC-2025';
const CODE_SOURCE = 'SRC-CRMEF-2025-FR-SPEC';
const MOT_DE_PASSE = 'Recette-FRONT3-2026!';

$fichier = getenv('REFERENTIEL_FICHIER') ?: '/tmp/recette-referentiel.json';

/* Le trait de tenancy lit ce contexte pour poser `tenant_id` sur une adhésion —
 * il n'est pas dans `$fillable` depuis le PAS-1.1. Sans ce réglage, la création
 * d'adhésion échoue hors requête HTTP. */
app(TenantContext::class)->set(Tenant::where('kind', 'platform')->firstOrFail());

$exam = Exam::where('code', CODE_EPREUVE)->first();

if ($exam === null) {
    echo 'ÉCHEC : l\'épreuve '.CODE_EPREUVE." est absente. Lancez d'abord `php artisan db:seed`.\n";
    exit(1);
}

$source = Source::where('code', CODE_SOURCE)->first();

if ($source === null) {
    echo 'ÉCHEC : la source '.CODE_SOURCE." est absente. Lancez d'abord `php artisan db:seed`.\n";
    exit(1);
}

/* Trois comptes distincts, trois métiers distincts : le valideur n'est jamais le
 * rédacteur (METHODE §7.2), et `QuestionIntegrityChecker` le refuse. Les rôles
 * viennent du référentiel du PAS-9 : `auteur` porte questions.create, `reviseur`
 * questions.review, `editeur` questions.validate et questions.publish. */
$membre = function (string $email, string $codeRole): User {
    $user = User::firstOrCreate(
        ['email' => $email],
        [
            'password' => MOT_DE_PASSE,
            'locale' => 'fr',
            'status' => 'active',
            'email_verified_at' => now(),
        ],
    );

    /* `verified.api` garde toute la surface d'administration. */
    if ($user->email_verified_at === null) {
        $user->markEmailAsVerified();
    }

    $roleId = Role::where('code', $codeRole)->whereNull('tenant_id')->value('id');

    if ($roleId === null) {
        echo "ÉCHEC : le rôle {$codeRole} est absent du référentiel.\n";
        exit(1);
    }

    if (! $user->memberships()->where('role_id', $roleId)->exists()) {
        $user->memberships()->create(['role_id' => $roleId]);
    }

    return $user;
};

$comptes = [
    'auteur' => ['email' => 'editorial.auteur@naja7i.test', 'role' => 'auteur'],
    'reviseur' => ['email' => 'editorial.relecteur@naja7i.test', 'role' => 'reviseur'],
    'editeur' => ['email' => 'editorial.valideur@naja7i.test', 'role' => 'editeur'],
];

foreach ($comptes as $cle => $definition) {
    $membre($definition['email'], $definition['role']);
    $comptes[$cle]['mot_de_passe'] = MOT_DE_PASSE;
}

/* Les feuilles de l'arbre de compétences de l'épreuve. `depth` 1 est le niveau
 * que le profil de taxonomie exige pour la publication (ADR-0012) : rattacher
 * plus haut ferait échouer `structuralIssues()`. */
$feuilles = CompetencyNode::where('exam_id', $exam->id)
    ->where('depth', 1)
    ->orderBy('id')
    ->get();

if ($feuilles->isEmpty()) {
    echo 'ÉCHEC : aucun nœud de compétence de profondeur 1 pour '.CODE_EPREUVE.".\n";
    exit(1);
}

$noeuds = [];

foreach ($feuilles as $noeud) {
    $remede = Remediation::firstOrCreate(
        ['competency_node_id' => $noeud->id, 'locale' => 'fr'],
        [
            'title' => "Reprendre : {$noeud->name_fr}",
            'content' => "Fiche de reprise du domaine « {$noeud->name_fr} ».",
            'estimated_minutes' => 15,
            'status' => 'published',
        ],
    );

    $noeuds[] = [
        'uuid' => $noeud->uuid,
        'code' => $noeud->code,
        'nom' => $noeud->name_fr,
        'remediation_uuid' => $remede->uuid,
    ];
}

file_put_contents($fichier, json_encode([
    'epreuve' => CODE_EPREUVE,
    'source' => ['uuid' => $source->uuid, 'code' => $source->code],
    'comptes' => $comptes,
    'noeuds' => $noeuds,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

echo '  référentiel : '.count($comptes).' comptes éditoriaux, '.count($noeuds)
    .' nœud(s), source '.$source->code."\n";
echo "  → {$fichier}\n";
