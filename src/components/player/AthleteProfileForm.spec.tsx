import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AthleteProfileDraft } from '@domain/athleteProfile';
import { AthleteProfileForm } from './AthleteProfileForm';

const vazio: AthleteProfileDraft = {
  genero: null,
  posicaoPrincipal: null,
  alturaCm: null,
  maoDominante: null,
  apelido: '',
  posicoesSecundarias: [],
};

function Montado(props: {
  showCondition?: boolean;
  level?: boolean;
  onChange?: (d: AthleteProfileDraft) => void;
}) {
  const [value, setValue] = useState(vazio);
  const [nivel, setNivel] = useState<1 | 2 | 3 | 4 | 5>(3);
  return (
    <AthleteProfileForm
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      showCondition={props.showCondition}
      level={props.level ? { value: nivel, onChange: setNivel } : null}
    />
  );
}

describe('AthleteProfileForm', () => {
  it('preenche os quatro obrigatorios', () => {
    const onChange = vi.fn();
    render(<Montado onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Feminino' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Levantador' }));
    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '170' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Destro' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        genero: 'F',
        posicaoPrincipal: 'levantador',
        alturaCm: 170,
        maoDominante: 'direita',
      }),
    );
  });

  it('apelido e secundarias sao opcionais e aparecem como tal', () => {
    render(<Montado />);
    expect(screen.getByLabelText(/apelido \(opcional\)/i)).toBeTruthy();
    expect(screen.getByRole('group', { name: /posições secundárias \(opcional\)/i })).toBeTruthy();
  });

  it('condicao fisica so quando pedida', () => {
    const { unmount } = render(<Montado />);
    expect(screen.queryByLabelText('Lesionado')).toBeNull();
    unmount();
    render(<Montado showCondition />);
    expect(screen.getByLabelText('Lesionado')).toBeTruthy();
    expect(screen.getByLabelText('Limitação física')).toBeTruthy();
  });

  it('nivel so quando pedido', () => {
    const { unmount } = render(<Montado />);
    expect(screen.queryByRole('group', { name: /nível/i })).toBeNull();
    unmount();
    render(<Montado level />);
    expect(screen.getByRole('group', { name: /nível/i })).toBeTruthy();
  });

  it('mostra o erro do servidor', () => {
    render(
      <AthleteProfileForm
        value={vazio}
        onChange={vi.fn()}
        serverError="A altura precisa estar entre 120 e 230 cm."
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('120 e 230');
  });
});
