import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { logoSymbol, palette } from '@vetta/tokens';

export interface EmailBrand {
  /** Nome exibido (white label: nome do personal). */
  name: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export interface NotificationEmailProps {
  title: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  preview?: string;
  brand?: EmailBrand;
  footer?: string;
}

const VETTA: EmailBrand = { name: 'Vetta' };

/** Layout único de e-mail transacional, com a marca Vetta ou a do personal (white label). */
export function NotificationEmail({
  title,
  body,
  ctaLabel,
  ctaUrl,
  preview,
  brand = VETTA,
  footer = 'Seu método. Seu aluno. Sua evolução.',
}: NotificationEmailProps) {
  const accent = brand.primaryColor ?? palette.tinta;
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{preview ?? body.slice(0, 120)}</Preview>
      <Body
        style={{
          backgroundColor: palette.nevoa,
          fontFamily: 'Inter, Arial, sans-serif',
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container
          style={{ backgroundColor: palette.branco, borderRadius: 16, maxWidth: 560, padding: 32 }}
        >
          <Section style={{ marginBottom: 24 }}>
            {brand.logoUrl ? (
              <Img src={brand.logoUrl} alt={brand.name} height={32} />
            ) : (
              <table role="presentation" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td style={{ verticalAlign: 'middle' }}>
                      <svg width="32" height="32" viewBox={logoSymbol.viewBox} aria-hidden="true">
                        <polyline
                          points={logoSymbol.points}
                          fill="none"
                          stroke={palette.tinta}
                          strokeWidth={logoSymbol.strokeWidth}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </td>
                    <td
                      style={{
                        verticalAlign: 'middle',
                        paddingLeft: 8,
                        fontSize: 24,
                        fontWeight: 800,
                        letterSpacing: '-0.03em',
                        color: palette.tinta,
                      }}
                    >
                      {brand.name === 'Vetta' ? 'vetta' : brand.name}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </Section>
          <Heading
            as="h1"
            style={{ color: palette.tinta, fontSize: 24, lineHeight: '32px', margin: '0 0 16px' }}
          >
            {title}
          </Heading>
          {body.split('\n').map((p, i) => (
            <Text
              key={i}
              style={{ color: palette.tinta, fontSize: 16, lineHeight: '24px', margin: '0 0 16px' }}
            >
              {p}
            </Text>
          ))}
          {ctaUrl && ctaLabel ? (
            <Section style={{ margin: '24px 0' }}>
              <Button
                href={ctaUrl}
                style={{
                  backgroundColor: accent,
                  color: palette.nevoa,
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 600,
                  padding: '12px 24px',
                  textDecoration: 'none',
                }}
              >
                {ctaLabel}
              </Button>
              <Text
                style={{ color: palette.grafite, fontSize: 12, lineHeight: '16px', marginTop: 16 }}
              >
                Se o botão não funcionar, copie e cole no navegador: {ctaUrl}
              </Text>
            </Section>
          ) : null}
          <Hr style={{ borderColor: palette.linha, margin: '24px 0' }} />
          <Text style={{ color: palette.grafite, fontSize: 12, lineHeight: '16px', margin: 0 }}>
            {brand.name === 'Vetta' ? footer : `${brand.name} · enviado pela Vetta`}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

NotificationEmail.PreviewProps = {
  title: 'Confirme seu e-mail',
  body: 'Olá, Ana! Falta pouco: confirme seu e-mail para ativar sua conta.',
  ctaLabel: 'Confirmar e-mail',
  ctaUrl: 'https://app.vettafit.com.br/verificar-email?token=exemplo',
} satisfies NotificationEmailProps;

export default NotificationEmail;
