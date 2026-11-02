import { Button, Logo } from '@vetta/ui';
import Link from 'next/link';
import { APP_URL } from '@/lib/data';
import { ConsentLink } from './consent';

export function Header({ dark = false }: { dark?: boolean }) {
  return (
    <header className={dark ? 'bg-tinta text-nevoa' : 'border-b border-border'}>
      <nav
        aria-label="Principal"
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4"
      >
        <Link href="/" aria-label="Vetta, página inicial">
          <Logo variant={dark ? 'positivo' : 'principal'} />
        </Link>
        <div className="flex items-center gap-1 text-sm font-medium sm:gap-4">
          <Link href="/#solucoes" className="hidden min-h-11 items-center sm:flex">
            Soluções
          </Link>
          <Link href="/precos" className="flex min-h-11 items-center">
            Preços
          </Link>
          <Link href="/blog" className="hidden min-h-11 items-center sm:flex">
            Blog
          </Link>
          <a href={`${APP_URL}/entrar`} className="flex min-h-11 items-center px-2">
            Entrar
          </a>
          <Button asChild variant="accent" size="sm">
            <a href={`${APP_URL}/cadastro`}>Comece grátis</a>
          </Button>
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 text-sm sm:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="text-muted-foreground">Seu método. Seu aluno. Sua evolução.</p>
        </div>
        <div className="flex flex-col">
          <strong className="mb-1">Produto</strong>
          <Link href="/#solucoes" className="flex min-h-11 items-center hover:underline">
            Soluções
          </Link>
          <Link href="/precos" className="flex min-h-11 items-center hover:underline">
            Preços
          </Link>
          <Link href="/#faq" className="flex min-h-11 items-center hover:underline">
            Perguntas frequentes
          </Link>
        </div>
        <div className="flex flex-col">
          <strong className="mb-1">Conteúdo</strong>
          <Link href="/blog" className="flex min-h-11 items-center hover:underline">
            Blog
          </Link>
          <Link href="/ajuda" className="flex min-h-11 items-center hover:underline">
            Central de ajuda
          </Link>
        </div>
        <div className="flex flex-col items-start">
          <strong className="mb-1">Legal</strong>
          <Link href="/termos" className="flex min-h-11 items-center hover:underline">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="flex min-h-11 items-center hover:underline">
            Política de privacidade
          </Link>
          <ConsentLink />
        </div>
      </div>
      <p className="pb-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Vetta · vettafit.com.br
      </p>
    </footer>
  );
}
