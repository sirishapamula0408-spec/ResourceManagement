import { Link, useSearchParams } from 'react-router-dom';
import { focusRing, SignInCard, SignInShell, TrustBadges } from '../components/SignInShell';
import { appConfig } from '../lib/appConfig';

/**
 * "Forgot password?" from the sign-in page. There is no self-service reset: an administrator sets
 * a temporary password and the person chooses their own at the next sign-in. The "Email
 * administrator" button needs VITE_ADMIN_EMAIL; without it the button is left out (a mailto with
 * no address would do nothing) and the paragraph alone says what to do.
 */
export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const next = params.get('next');
  const signIn = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

  return (
    <SignInShell title="Reset password · SedHub">
      <SignInCard>
        <h1 className="text-[1.55rem] font-bold text-[#0b1f5c]">Reset your password</h1>
        <p className="mt-2 text-sm text-[#3b4867]">
          Ask your administrator to reset it. You will choose a new password the next time you sign
          in.
        </p>

        {appConfig.adminEmail && (
          <a
            href={`mailto:${appConfig.adminEmail}?subject=${encodeURIComponent('SedHub password reset')}`}
            className={`mt-[clamp(1rem,2.6vh,1.5rem)] flex h-[clamp(2.5rem,5.2vh,3rem)] items-center justify-center rounded-md bg-[#0f3bcf] text-[15px] font-semibold text-white shadow-sm hover:bg-[#0b31b0] ${focusRing}`}
          >
            Email administrator
          </a>
        )}

        <p className="mt-[clamp(0.75rem,2vh,1.25rem)] text-center text-[13px]">
          <Link
            to={signIn}
            className={`rounded font-medium text-[#1546d6] hover:underline focus-visible:underline ${focusRing}`}
          >
            Back to sign in
          </Link>
        </p>

        <TrustBadges />
      </SignInCard>
    </SignInShell>
  );
}
