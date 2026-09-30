import type { CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { IconeAtualizar, IconeLupa, IconeX } from './Icones'

/*
 * Peças visuais das telas de consulta (monitoramento, integrações, plataformas), para as três
 * terem a mesma cara: faixa de filtros, cabeçalho fixo, linhas com hover e rodapé de contagem.
 */

/** Cor estável por plataforma: a mesma plataforma sempre cai na mesma cor, maiúscula ou não. */
const CORES_PLATAFORMA = [
  'bg-brand-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-indigo-500',
]

function corDaPlataforma(nome: string): string {
  let hash = 0
  for (const letra of nome.toLowerCase()) {
    hash = (hash * 31 + letra.charCodeAt(0)) >>> 0
  }
  return CORES_PLATAFORMA[hash % CORES_PLATAFORMA.length]
}

/**
 * Cores oficiais das marcas. "texto" é para fundo claro; no modo escuro valem os tons "Escuro",
 * porque o azul-marinho, o roxo e o preto das marcas somem sobre o grafite.
 */
const MARCAS: {
  chave: string
  principal: string
  secundaria: string
  texto: string
  secundariaEscuro: string
  textoEscuro: string
}[] = [
  { chave: 'cilia', principal: '#0468F0', secundaria: '#2B2B2B', texto: '#0453BF', secundariaEscuro: '#D4D4D8', textoEscuro: '#5EA2FF' },
  { chave: 'tray', principal: '#46A4D6', secundaria: '#02306E', texto: '#02306E', secundariaEscuro: '#4F7BC8', textoEscuro: '#7CC4EC' },
  { chave: 'shopify', principal: '#95BF47', secundaria: '#5E8E3E', texto: '#4B7A2F', secundariaEscuro: '#6FA34A', textoEscuro: '#AED36A' },
  { chave: 'climba', principal: '#5FD33A', secundaria: '#1C1C3A', texto: '#1C1C3A', secundariaEscuro: '#C7C9E8', textoEscuro: '#8BE36C' },
  { chave: 'shoppub', principal: '#78B52C', secundaria: '#545663', texto: '#545663', secundariaEscuro: '#A3A6B4', textoEscuro: '#9ACD5C' },
  { chave: 'nuvemshop', principal: '#4A6FB5', secundaria: '#2C3357', texto: '#2C3357', secundariaEscuro: '#9AA6CF', textoEscuro: '#94AEE3' },
  { chave: 'mercos', principal: '#03C95E', secundaria: '#663990', texto: '#663990', secundariaEscuro: '#A77BD4', textoEscuro: '#C3A0E6' },
  { chave: 'convertize', principal: '#F05A38', secundaria: '#263845', texto: '#C7401F', secundariaEscuro: '#9FB1BE', textoEscuro: '#FF8E70' },
]

export const CORES_DAS_MARCAS = MARCAS.map((m) => ({ nome: m.chave, cor: m.principal }))

function marcaDaPlataforma(nome: string) {
  const normalizado = nome.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '')
  return MARCAS.find((m) => normalizado.includes(m.chave))
}

export function EtiquetaPlataforma({ nome }: { nome?: string | null }) {
  if (!nome) {
    return <span className="text-slate-400">N/A</span>
  }
  const marca = marcaDaPlataforma(nome)
  if (!marca) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-inset ring-slate-200">
        <span className={`h-1.5 w-1.5 rounded-full ${corDaPlataforma(nome)}`} />
        {nome}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--m-texto)] dark:text-[color:var(--m-texto-escuro)]"
      style={
        {
          '--m-texto': marca.texto,
          '--m-texto-escuro': marca.textoEscuro,
          '--m-sec': marca.secundaria,
          '--m-sec-escuro': marca.secundariaEscuro,
          backgroundColor: `${marca.principal}1A`,
          boxShadow: `inset 0 0 0 1px ${marca.principal}45`,
        } as CSSProperties
      }
    >
      <span className="flex -space-x-0.5" aria-hidden="true">
        <span className="h-2 w-2 rounded-full ring-1 ring-surface" style={{ backgroundColor: marca.principal }} />
        <span className="h-2 w-2 rounded-full bg-[color:var(--m-sec)] ring-1 ring-surface dark:bg-[color:var(--m-sec-escuro)]" />
      </span>
      {nome}
    </span>
  )
}

export function EtiquetaSituacao({ ativo }: { ativo: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        ativo
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
          : 'bg-slate-100 text-slate-600 ring-slate-500/20'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ativo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {ativo ? 'Ativa' : 'Inativa'}
    </span>
  )
}

/** Card da consulta: cabeçalho (título ou abas), faixa de filtros opcional e conteúdo. */
export function CartaoConsulta({
  cabecalho,
  filtros,
  rodape,
  children,
}: {
  cabecalho: ReactNode
  filtros?: ReactNode
  rodape?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-card">
      <div className="group flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        {cabecalho}
      </div>
      {filtros && <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3">{filtros}</div>}
      {children}
      {rodape && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-[13px] text-slate-500">{rodape}</div>
      )}
    </div>
  )
}

export function TituloConsulta({
  titulo,
  subtitulo,
  icone,
}: {
  titulo: string
  subtitulo?: string
  icone?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      {icone && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 transition-transform duration-200 group-hover:scale-105">
          <span className="h-[18px] w-[18px]">{icone}</span>
        </div>
      )}
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-slate-900">{titulo}</h3>
        {subtitulo && <p className="text-[13px] text-slate-500">{subtitulo}</p>}
      </div>
    </div>
  )
}

export function RodapeContagem({ visiveis, total }: { visiveis: number; total: number }) {
  return (
    <>
      Exibindo <strong className="font-semibold text-slate-700 tabular-nums">{visiveis}</strong> de{' '}
      <strong className="font-semibold text-slate-700 tabular-nums">{total}</strong> registros
    </>
  )
}

const CLASSE_CAMPO_FILTRO =
  'block h-9 w-full rounded-lg border-slate-200 bg-surface text-sm shadow-soft transition duration-150 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15'

export function CampoBusca({
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
        <span className="h-4 w-4">
          <IconeLupa />
        </span>
      </span>
      <input
        type="text"
        className={`${CLASSE_CAMPO_FILTRO} pl-9`}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    </div>
  )
}

export function SelectFiltro({
  onChange,
  children,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & { onChange: (v: string) => void }) {
  return (
    <select
      className={`${CLASSE_CAMPO_FILTRO} py-0 ${props.value ? 'font-medium text-slate-900' : 'text-slate-500'}`}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    >
      {children}
    </select>
  )
}

export function BotaoLimpar({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 transition-all duration-150 hover:bg-surface hover:text-red-600 hover:shadow-soft active:scale-[0.97] disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent disabled:hover:shadow-none disabled:active:scale-100"
    >
      <span className="h-4 w-4">
        <IconeX />
      </span>
      Limpar
    </button>
  )
}

export function BotaoAtualizar({ onClick, carregando }: { onClick: () => void; carregando: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={carregando}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 text-sm font-medium text-slate-700 shadow-soft transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:text-slate-400 disabled:active:scale-100"
    >
      <span className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`}>
        <IconeAtualizar />
      </span>
      {carregando ? 'Atualizando…' : 'Atualizar'}
    </button>
  )
}

/** Tabela com cabeçalho fixo e rolagem interna. */
export function Tabela({
  colunas,
  children,
  alturaMaxima = 'max-h-[75vh]',
}: {
  colunas: { rotulo: string; className?: string }[]
  children: ReactNode
  alturaMaxima?: string
}) {
  return (
    <div className={`overflow-auto ${alturaMaxima}`}>
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_theme(colors.slate.200)]">
          <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            {colunas.map((c, i) => (
              <th
                key={c.rotulo}
                className={`whitespace-nowrap py-2.5 ${i === 0 ? 'pl-5 pr-3' : i === colunas.length - 1 ? 'pl-3 pr-5' : 'px-3'} ${c.className ?? ''}`}
              >
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  )
}

export function Linha({ children }: { children: ReactNode }) {
  return <tr className="group align-top transition-colors duration-150 hover:bg-slate-50/80">{children}</tr>
}

/** Célula com o espaçamento da tabela. primeira/ultima alinham com o respiro lateral do card. */
export function Celula({
  children,
  primeira,
  ultima,
  className = '',
}: {
  children: ReactNode
  primeira?: boolean
  ultima?: boolean
  className?: string
}) {
  return (
    <td
      className={`py-3.5 ${
        primeira
          ? 'pl-5 pr-3 transition-shadow duration-150 group-hover:shadow-[inset_3px_0_0_0_theme(colors.brand.500)]'
          : ultima
            ? 'pl-3 pr-5'
            : 'px-3'
      } ${className}`}
    >
      {children}
    </td>
  )
}

export function Codigo({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-800 ring-1 ring-inset ring-slate-200/70">
      {children}
    </span>
  )
}

export function EstadoVazio({
  icone,
  titulo,
  texto,
  tom = 'neutro',
  acao,
}: {
  icone: ReactNode
  titulo?: string
  texto: string
  tom?: 'neutro' | 'sucesso' | 'erro'
  acao?: ReactNode
}) {
  const cores = {
    neutro: 'bg-slate-50 text-slate-400 ring-slate-200',
    sucesso: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
    erro: 'bg-red-50 text-red-600 ring-red-200',
  }[tom]
  return (
    <div className="flex flex-col items-center px-5 py-16 text-center animate-fade-in">
      <div
        data-segredo={tom === 'sucesso' ? 'cafe' : undefined}
        className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-soft ring-1 ring-inset ${cores}`}
      >
        <span className="h-6 w-6">{icone}</span>
      </div>
      {titulo && <h4 className="mt-4 text-[15px] font-semibold tracking-tight text-slate-900">{titulo}</h4>}
      <p className={`${titulo ? 'mt-1' : 'mt-4'} max-w-md text-sm text-slate-500`}>{texto}</p>
      {acao && <div className="mt-3">{acao}</div>}
    </div>
  )
}

const LARGURAS_ESQUELETO = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-3/5']

export function Carregando({ texto = 'Carregando dados…' }: { texto?: string }) {
  return (
    <div className="space-y-5 px-5 py-6" aria-busy="true">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
        {texto}
      </div>
      {LARGURAS_ESQUELETO.map((largura, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-3 w-20 shrink-0 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-28 shrink-0 animate-pulse rounded bg-slate-100" />
          <div className="flex-1">
            <div className={`h-3 animate-pulse rounded bg-slate-100 ${largura}`} />
          </div>
          <div className="h-3 w-14 shrink-0 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}
