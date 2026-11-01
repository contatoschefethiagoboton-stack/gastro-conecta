import PaginaInstitucional from '@/components/PaginaInstitucional';

export const metadata = { title: 'Privacidade' };

export default function Page() {
  return (
    <PaginaInstitucional title="Privacidade (LGPD)">
      <p>Visitantes navegam sem cadastro. Dos anunciantes, coletamos dados de identificação para verificação de idade e cumprimento de obrigações legais; esses dados são cifrados, nunca exibidos publicamente e só são fornecidos a autoridades nos termos do Marco Civil da Internet.</p>
      <p>Texto completo em elaboração com assessoria jurídica.</p>
    </PaginaInstitucional>
  );
}
