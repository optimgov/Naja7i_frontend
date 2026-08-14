<?php
/**
 * remettre-quota.php — RENDRE AU COMPTE DE RECETTE UN QUOTA F03 NEUF.
 *
 *   php artisan tinker <chemin-vers-ce-fichier>      (depuis le dépôt backend)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SCRIPT EXISTE — ET CE QU'IL A RÉVÉLÉ
 *
 * Le quota de causes est CUMULATIF et n'est jamais remis à zéro : c'est une
 * décision de produit (fiche F03), et une bonne — un compteur quotidien ferait
 * attendre le lendemain plutôt que s'abonner. Sur un poste, le compte de
 * recette épuise donc ses deux unités à la première exécution et ne les
 * retrouve jamais.
 *
 * En intégration continue la base est neuve : le compte part avec son quota
 * entier. Sur un poste, non. La recette mesurait donc DEUX CHOSES DIFFÉRENTES
 * selon la machine — exactement le défaut corrigé au D-F49 pour le calendrier
 * de révision, et jamais vu ici parce qu'un BOGUE le masquait.
 *
 * CE BOGUE ÉTAIT LE BLOC-1 DE L'AUDIT TOURNÉE 3. Les causes sortaient sans
 * acquisition ; le contrôle « la cause est présentée comme une hypothèse »
 * trouvait donc toujours une cause à l'écran, quota épuisé ou non. Il passait
 * GRÂCE à la fuite. Une fois la fuite fermée, il est devenu rouge sur un poste
 * — et il aurait dû l'être depuis le début.
 *
 * CE QUE CE SCRIPT NE FAIT PAS
 *
 * Il ne touche ni au produit ni à la règle : il remet le compte de recette dans
 * l'état d'un candidat NEUF, ce qu'un candidat réel est une fois. Aucun autre
 * compte n'est touché.
 * ─────────────────────────────────────────────────────────────────────────
 */

use App\Models\CauseAcquisition;
use App\Models\CauseRevealCounter;
use App\Models\Response;
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

$compteur = CauseRevealCounter::where('user_id', $user->id)->first();
$avant = $compteur?->revealed ?? 0;

CauseRevealCounter::where('user_id', $user->id)->delete();
$acquisitions = CauseAcquisition::where('user_id', $user->id)->delete();

/* `cause_revealed` marque les réponses dont la cause a déjà été payée : la
 * laisser vraie rendrait la cause visible sans consommer d'unité, et le test
 * du mur ne mesurerait plus rien. */
$reponses = Response::whereHas(
    'attemptItem.attempt',
    fn ($q) => $q->where('user_id', $user->id)
)->where('cause_revealed', true)->update(['cause_revealed' => false]);

echo "  quota F03 remis à neuf pour {$email} : {$avant} unité(s) rendue(s), "
    ."{$acquisitions} acquisition(s) et {$reponses} révélation(s) effacées\n";
