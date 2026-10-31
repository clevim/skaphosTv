/**
 * Painel lateral dos sheets do player (áudio, legenda, faixas, timer).
 * TV/web: painel lateral. Smartphone: bottom sheet (polegar alcança, padrão do SO).
 *
 * Estrutura única: painel encostado à direita, altura cheia, sobre o vídeo — o
 * quadro continua visível à esquerda (convenção de player de streaming). Título
 * grande, linhas sem divisória, item ativo = check no acento à direita, "Fechar"
 * como texto quieto no rodapé. Folga lateral/vertical ≥ anel de foco (5px fora).
 */
import { StyleSheet } from 'react-native';
import { colors, radius, fontFamily } from '../utils/theme';
import { IS_MOBILE } from '../utils/tvDetect';

export const PANEL_W = 440;

export const sheet = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 20,
    flexDirection: IS_MOBILE ? 'column' : 'row',
    justifyContent: 'flex-end',
    // Escurece pouco: o vídeo atrás é contexto, não ruído.
    backgroundColor: IS_MOBILE ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.35)',
  },
  panel: IS_MOBILE ? {
    // Player do celular fica em paisagem: limita a largura e centraliza.
    width: '100%', maxWidth: 560, alignSelf: 'center',
    maxHeight: '88%',
    backgroundColor: colors.bg1,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 20,
  } : {
    width: PANEL_W,
    maxWidth: '92%',
    height: '100%',
    backgroundColor: 'rgba(14,11,20,0.97)',
    paddingTop: 44,
    paddingBottom: 24,
  },
  title: {
    paddingHorizontal: IS_MOBILE ? 24 : 32,
    marginBottom: 14,
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.text1,
    letterSpacing: -0.5,
  },
  list: { flexGrow: 0, flexShrink: 1 },
  listInner: { paddingHorizontal: 18, paddingVertical: 8, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontFamily: fontFamily.medium, color: colors.text2 },
  rowTitleOn: { color: colors.text1, fontFamily: fontFamily.semiBold },
  rowSub: { fontSize: 13, fontFamily: fontFamily.regular, color: colors.text3, marginTop: 2 },
  section: {
    paddingHorizontal: IS_MOBILE ? 24 : 32,
    marginTop: 18,
    marginBottom: 6,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.text3,
  },
  footer: { paddingHorizontal: 18, paddingTop: 12, marginTop: IS_MOBILE ? 0 : 'auto' },
  // Mobile: botão inteiro de 48dp (alvo de toque); TV/web: texto quieto.
  close: IS_MOBILE ? {
    minHeight: 48, paddingHorizontal: 24, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg2,
  } : {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  closeText: { fontSize: 15, fontFamily: fontFamily.medium, color: colors.text2 },
});
