import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  ZoomControl,
  GeoJSON,
} from 'react-leaflet';
import contornoBrasil from './brasil.json';
import L from 'leaflet';
import * as XLSX from 'xlsx';
import './App.css';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Upload,
  X,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  SlidersHorizontal,
  Settings,
  Check,
} from 'lucide-react';

const SUPABASE_URL = 'https://hiijisdnardhlbwnpfzh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_484Rbk7OM-PE6EzykjX2Jg_U5c8G7WU';
const MODO_DEMO = false;

const CORES = {
  Verde: { hex: '#16a34a', label: 'Verde' },
  Azul: { hex: '#2563eb', label: 'Azul' },
  Amarelo: { hex: '#ca8a04', label: 'Amarelo' },
  Vermelho: { hex: '#dc2626', label: 'Vermelho' },
};

const CORES_VALIDAS = Object.keys(CORES);

// Estilos de fundo do mapa, trocáveis pela engrenagem. Nenhum exige cadastro ou chave.
const ESTILOS_MAPA = {
  padrao: {
    nome: 'Padrão',
    resumo: 'OpenStreetMap, colorido',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribuicao: '&copy; OpenStreetMap',
    fundo: '#dfdfdf',
    amostra: ['#e8e0d8', '#aadaa0', '#9cc6e8'],
  },
  claro: {
    nome: 'Cinza claro',
    resumo: 'Ruas discretas, os pins se destacam',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    atribuicao: 'Tiles &copy; Esri',
    fundo: '#f3f3f3',
    amostra: ['#f5f5f5', '#dcdcdc', '#c4c4c4'],
  },
  escuro: {
    nome: 'Escuro',
    resumo: 'Fundo escuro, bom para telão',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    atribuicao: 'Tiles &copy; Esri',
    fundo: '#2b2b2b',
    amostra: ['#3a3a3a', '#2b2b2b', '#565656'],
  },
  satelite: {
    nome: 'Satélite',
    resumo: 'Imagem de satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    atribuicao: 'Tiles &copy; Esri',
    fundo: '#1b2a1b',
    amostra: ['#3e5c3a', '#6b7f4a', '#2f4858'],
  },
  liso: {
    nome: 'Fundo liso',
    resumo: 'Só o contorno do Brasil, sem ruas',
    semTiles: true,
    fundo: '#eaf1f7',
    preenchimento: '#ffffff',
    borda: '#b9c6d4',
    amostra: ['#eaf1f7', '#ffffff', '#b9c6d4'],
  },
};
const ESTILO_PADRAO = 'padrao';

// Enquadramento inicial: o Brasil inteiro. A navegação segue livre depois disso.
const LIMITES_BRASIL = [
  [-33.75, -73.99],
  [5.28, -34.79],
];

// Texto exibido ao passar o mouse ou tocar no "i" da legenda
const DESCRICAO_CORES = {
  Verde: 'Cliente ativo com alto volume de compras.',
  Azul: 'Cliente ativo com volume médio.',
  Amarelo: 'Cliente ativo com volume baixo.',
  Vermelho: 'Cliente inativo, sem compras recentes.',
};

const criarIcone = (cor) =>
  L.divIcon({
    className: 'pin-customizado',
    html: `<div style="background:${cor};width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:10px;height:10px;background:white;border-radius:50%;transform:rotate(45deg);"></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });

const supabaseFetch = async (endpoint, options = {}) => {
  if (MODO_DEMO) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
};

const geocodificar = async (endereco) => {
  if (!endereco) return null;

  try {
    let buscaFinal = endereco;

    const matchNumero = endereco.match(/,\s*(\d+[A-Za-z]?)/);
    const numero = matchNumero ? matchNumero[1] : '';
    const matchCep = endereco.match(/\b\d{5}-?\d{3}\b/);

    if (matchCep) {
      const cep = matchCep[0].replace('-', '');
      try {
        const resCep = await fetch(
          `https://brasilapi.com.br/api/cep/v2/${cep}`
        );
        if (resCep.ok) {
          const dados = await resCep.json();
          if (dados.street && dados.city && dados.state) {
            buscaFinal = `${dados.street}, ${numero}, ${dados.city}, ${dados.state}, Brasil`;
          } else if (dados.location && dados.location.coordinates) {
            return {
              lat: parseFloat(dados.location.coordinates.latitude),
              lng: parseFloat(dados.location.coordinates.longitude),
            };
          }
        }
      } catch (e) {
        console.warn('BrasilAPI indisponível, caindo pro plano B.');
      }
    }

    if (buscaFinal === endereco) {
      buscaFinal = endereco
        .replace(/R\.\s/gi, 'Rua ')
        .replace(/Av\.\s/gi, 'Avenida ')
        .replace(/\b\d{5}-?\d{3}\b/g, '')
        .replace(/\s-\s/g, ', ')
        .trim();

      if (!buscaFinal.toLowerCase().includes('brasil')) {
        buscaFinal += ', Brasil';
      }
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      buscaFinal
    )}&limit=1&countrycodes=br&email=contato@ortomedical.com.br`;

    const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
    if (!res.ok) return null;

    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }

    return null;
  } catch (error) {
    console.error('Erro ao geocodificar:', error);
    return null;
  }
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const LARGURA_MOBILE = 768;

// true quando a tela é de celular; acompanha giro de tela e redimensionamento
const useEhMobile = () => {
  const consulta = `(max-width: ${LARGURA_MOBILE}px)`;
  const [ehMobile, setEhMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(consulta).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const aoMudar = (e) => setEhMobile(e.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, [consulta]);
  return ehMobile;
};

// Zoom mínimo usado só quando o usuário escolhe o cliente pela lista lateral
const ZOOM_MINIMO_LISTA = 13;

const CentralizarNoCliente = ({ cliente, origem }) => {
  const map = useMap();
  useEffect(() => {
    if (!cliente || !cliente.lat || !cliente.lng) return;
    // Clique no pin: o popup abre no lugar. Não mexemos no mapa, então o zoom fica como está.
    if (origem === 'mapa') return;
    // Clique na lista: centraliza, mas nunca afasta o que o usuário já aproximou.
    const zoomAtual = map.getZoom();
    map.flyTo([cliente.lat, cliente.lng], Math.max(zoomAtual, ZOOM_MINIMO_LISTA), {
      duration: 1.2,
    });
  }, [cliente, origem, map]);
  return null;
};

// Item da legenda: mostra a contagem e explica o que a cor significa
const ItemLegenda = ({ cor, total, aberta, aoAlternar, ehMobile, alinhar }) => {
  const [sobre, setSobre] = useState(false);
  const mostrar = aberta || (!ehMobile && sobre);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          aoAlternar(aberta ? null : cor);
        }}
        onMouseEnter={() => setSobre(true)}
        onMouseLeave={() => setSobre(false)}
        aria-label={`${cor}: ${DESCRICAO_CORES[cor]}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          width: '100%',
          padding: '4px 2px',
          background: 'none',
          border: 'none',
          borderRadius: 4,
          textAlign: 'left',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: CORES[cor].hex,
            color: 'white',
            fontSize: 10,
            fontWeight: 700,
            lineHeight: '16px',
            textAlign: 'center',
            flexShrink: 0,
            fontStyle: 'italic',
            fontFamily: 'Georgia, serif',
          }}
          aria-hidden="true"
        >
          i
        </span>
        <span style={{ color: '#666' }}>
          {cor}: <b style={{ color: '#222' }}>{total}</b>
        </span>
      </button>

      {mostrar && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            // na coluna da direita a dica é ancorada pela direita, senão estoura a barra lateral
            ...(alinhar === 'direita' ? { right: 0 } : { left: 0 }),
            zIndex: 1300,
            width: 'max-content',
            minWidth: 170,
            maxWidth: 210,
            padding: '8px 10px',
            borderRadius: 6,
            background: '#171717',
            color: 'white',
            fontSize: 12,
            lineHeight: 1.4,
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
          }}
        >
          <b style={{ display: 'block', marginBottom: 2 }}>{cor}</b>
          {DESCRICAO_CORES[cor]}
        </div>
      )}
    </div>
  );
};

// Abre o mapa já enquadrado no Brasil inteiro, uma única vez
const EnquadrarBrasil = () => {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(LIMITES_BRASIL, { padding: [20, 20], animate: false });
  }, [map]);
  return null;
};

// O react-leaflet só aplica o style na montagem, então a cor de fundo é trocada direto no container
const FundoMapa = ({ cor }) => {
  const map = useMap();
  useEffect(() => {
    map.getContainer().style.background = cor;
  }, [map, cor]);
  return null;
};

// Engrenagem que troca o estilo de fundo do mapa
const SeletorEstilo = ({ estilo, aoEscolher, aberto, aoAlternar }) => (
  <div style={{ position: 'absolute', top: 92, right: 10, zIndex: 1000 }}>
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        aoAlternar(!aberto);
      }}
      aria-label="Mudar o estilo do mapa"
      title="Estilo do mapa"
      style={{
        width: 34,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        border: '2px solid rgba(0,0,0,0.2)',
        background: 'white',
        color: '#171717',
        cursor: 'pointer',
        boxShadow: '0 1px 5px rgba(0,0,0,0.25)',
      }}
    >
      <Settings size={18} />
    </button>

    {aberto && (
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 40,
          right: 0,
          width: 232,
          background: 'white',
          borderRadius: 8,
          border: '1px solid #e5e5e5',
          boxShadow: '0 6px 22px rgba(0,0,0,0.22)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '10px 12px',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            color: '#666',
            borderBottom: '1px solid #eee',
          }}
        >
          Estilo do mapa
        </div>
        {Object.entries(ESTILOS_MAPA).map(([chave, e]) => {
          const ativo = chave === estilo;
          return (
            <button
              key={chave}
              type="button"
              onClick={() => aoEscolher(chave)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '9px 12px',
                border: 'none',
                borderBottom: '1px solid #f3f3f3',
                background: ativo ? '#f0f7f2' : 'white',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  width: 26,
                  height: 26,
                  borderRadius: 5,
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '1px solid #ddd',
                }}
                aria-hidden="true"
              >
                {e.amostra.map((c, i) => (
                  <span key={i} style={{ flex: 1, background: c }} />
                ))}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#171717',
                  }}
                >
                  {e.nome}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: '#777' }}>
                  {e.resumo}
                </span>
              </span>
              {ativo && <Check size={15} color="#16a34a" />}
            </button>
          );
        })}
      </div>
    )}
  </div>
);

// O Leaflet precisa ser avisado quando o container muda de tamanho (giro de tela, barra do navegador)
const AjustarAoRedimensionar = () => {
  const map = useMap();
  useEffect(() => {
    const ajustar = () => map.invalidateSize();
    window.addEventListener('resize', ajustar);
    window.addEventListener('orientationchange', ajustar);
    const t = setTimeout(ajustar, 300);
    return () => {
      window.removeEventListener('resize', ajustar);
      window.removeEventListener('orientationchange', ajustar);
      clearTimeout(t);
    };
  }, [map]);
  return null;
};

export default function App() {
  const [clientes, setClientes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('Todas');
  const [filtroVendedor, setFiltroVendedor] = useState('Todos');
  const [filtroEstado, setFiltroEstado] = useState('Todos'); // NOVO FILTRO AQUI
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [origemSelecao, setOrigemSelecao] = useState(null); // 'mapa' | 'lista'
  const [painelAberto, setPainelAberto] = useState(false); // gaveta de filtros no celular
  const [corExplicada, setCorExplicada] = useState(null); // cor com a dica aberta na legenda
  const [estiloMapa, setEstiloMapa] = useState(() => {
    try {
      const salvo = localStorage.getItem('estilo-mapa');
      if (salvo && ESTILOS_MAPA[salvo]) return salvo;
    } catch (e) {
      /* navegador sem localStorage: segue com o padrão */
    }
    return ESTILO_PADRAO;
  });
  const [seletorEstiloAberto, setSeletorEstiloAberto] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [clienteEditando, setClienteEditando] = useState(null);
  const [aviso, setAviso] = useState(null);

  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0, falhas: 0 });
  const cancelarImportRef = useRef(false);

  const ehMobile = useEhMobile();

  // No celular, escolher pela lista fecha a gaveta para o mapa aparecer
  const selecionarCliente = (cliente, origem) => {
    setOrigemSelecao(origem);
    setClienteSelecionado(cliente);
    if (origem === 'lista' && ehMobile) setPainelAberto(false);
  };

  // Ao voltar para tela grande, a gaveta não deve continuar "aberta"
  useEffect(() => {
    if (!ehMobile) setPainelAberto(false);
  }, [ehMobile]);

  const escolherEstilo = (chave) => {
    setEstiloMapa(chave);
    setSeletorEstiloAberto(false);
    try {
      localStorage.setItem('estilo-mapa', chave);
    } catch (e) {
      /* sem localStorage a escolha vale só nesta sessão */
    }
  };

  // O seletor de estilo fecha ao clicar fora ou com Esc
  useEffect(() => {
    if (!seletorEstiloAberto) return;
    const fechar = () => setSeletorEstiloAberto(false);
    const porTecla = (e) => {
      if (e.key === 'Escape') setSeletorEstiloAberto(false);
    };
    document.addEventListener('click', fechar);
    document.addEventListener('keydown', porTecla);
    return () => {
      document.removeEventListener('click', fechar);
      document.removeEventListener('keydown', porTecla);
    };
  }, [seletorEstiloAberto]);

  // A dica da legenda fecha ao clicar em qualquer outro lugar ou com Esc
  useEffect(() => {
    if (!corExplicada) return;
    const fechar = () => setCorExplicada(null);
    const porTecla = (e) => {
      if (e.key === 'Escape') setCorExplicada(null);
    };
    document.addEventListener('click', fechar);
    document.addEventListener('keydown', porTecla);
    return () => {
      document.removeEventListener('click', fechar);
      document.removeEventListener('keydown', porTecla);
    };
  }, [corExplicada]);

  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    carregar();
  }, []);

  const carregar = async () => {
    setCarregando(true);
    try {
      const data = await supabaseFetch('clientes?select=*&order=nome.asc');
      setClientes(data || []);
    } catch (e) {
      mostrarAviso('Erro ao carregar: ' + e.message, 'erro');
    }
    setCarregando(false);
  };

  const mostrarAviso = (msg, tipo = 'info') => {
    setAviso({ msg, tipo });
    setTimeout(() => setAviso(null), 4000);
  };

  const vendedores = useMemo(() => {
    const set = new Set(clientes.map((c) => c.vendedor).filter(Boolean));
    return ['Todos', ...Array.from(set).sort()];
  }, [clientes]);

  // NOVA LISTA DE ESTADOS AQUI
  const estados = useMemo(() => {
    const set = new Set(clientes.map((c) => c.estado).filter(Boolean));
    return ['Todos', ...Array.from(set).sort()];
  }, [clientes]);

  const clientesFiltrados = useMemo(() => {
    return clientes.filter((c) => {
      if (filtroStatus !== 'Todas' && c.status_conta !== filtroStatus)
        return false;
      if (filtroVendedor !== 'Todos' && c.vendedor !== filtroVendedor)
        return false;
      if (filtroEstado !== 'Todos' && c.estado !== filtroEstado)
        // REGRA DO FILTRO AQUI
        return false;
      if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase()))
        return false;
      return true;
    });
  }, [clientes, busca, filtroStatus, filtroVendedor, filtroEstado]);

  const contadores = useMemo(() => {
    const c = { Verde: 0, Azul: 0, Amarelo: 0, Vermelho: 0 };
    clientes.forEach((cli) => {
      if (c[cli.status_conta] !== undefined) c[cli.status_conta]++;
    });
    return c;
  }, [clientes]);

  const abrirNovo = () => {
    setClienteEditando({
      nome: '',
      endereco: '',
      vendedor: '',
      status_conta: 'Amarelo',
    });
    setModalAberto(true);
  };

  const abrirEdicao = (cliente) => {
    setClienteEditando({ ...cliente });
    setModalAberto(true);
  };

  const salvar = async () => {
    const c = clienteEditando;
    if (!c.nome || !c.endereco) {
      mostrarAviso('Preencha nome e endereço', 'erro');
      return;
    }
    const enderecoMudou =
      !c.id ||
      (c.id && clientes.find((x) => x.id === c.id)?.endereco !== c.endereco);
    let lat = c.lat,
      lng = c.lng;

    if (enderecoMudou) {
      mostrarAviso('Buscando endereço no mapa...', 'info');
      const coords = await geocodificar(c.endereco);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      } else {
        mostrarAviso('Endereço não encontrado. Salvando sem mapa.', 'erro');
      }
    }

    try {
      const payload = {
        nome: c.nome,
        endereco: c.endereco,
        vendedor: c.vendedor,
        status_conta: c.status_conta,
        lat,
        lng,
      };
      if (c.id) {
        await supabaseFetch(`clientes?id=eq.${c.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await supabaseFetch('clientes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setModalAberto(false);
      setClienteEditando(null);
      await carregar();
      mostrarAviso(
        c.id ? 'Cliente atualizado!' : 'Cliente cadastrado!',
        'sucesso'
      );
    } catch (e) {
      mostrarAviso('Erro ao salvar: ' + e.message, 'erro');
    }
  };

  const excluir = async (cliente) => {
    if (!confirm(`Excluir ${cliente.nome}?`)) return;
    try {
      await supabaseFetch(`clientes?id=eq.${cliente.id}`, { method: 'DELETE' });
      setClienteSelecionado(null);
      await carregar();
      mostrarAviso('Cliente excluído', 'sucesso');
    } catch (e) {
      mostrarAviso('Erro ao excluir: ' + e.message, 'erro');
    }
  };

  const importarPlanilha = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (linhas.length === 0) {
        mostrarAviso('Planilha vazia', 'erro');
        return;
      }

      const primeira = linhas[0];
      const colunasNecessarias = [
        'Nome do Cliente',
        'Vendedor',
        'Endereço',
        'Status da Conta',
      ];
      const faltando = colunasNecessarias.filter((c) => !(c in primeira));
      if (faltando.length > 0) {
        mostrarAviso(`Colunas faltando: ${faltando.join(', ')}`, 'erro');
        return;
      }

      if (
        !confirm(
          `Importar ${linhas.length} clientes? Vai levar cerca de ${Math.ceil(
            (linhas.length * 1.2) / 60
          )} minutos. Mantenha esta aba aberta.`
        )
      )
        return;

      setImportando(true);
      cancelarImportRef.current = false;
      setProgresso({ atual: 0, total: linhas.length, falhas: 0 });

      let falhas = 0;
      for (let i = 0; i < linhas.length; i++) {
        if (cancelarImportRef.current) break;

        const linha = linhas[i];
        const nome = String(linha['Nome do Cliente'] || '').trim();
        const vendedor = String(linha['Vendedor'] || '').trim();
        const endereco = String(linha['Endereço'] || '').trim();
        const statusBruto = String(linha['Status da Conta'] || '').trim();
        const status =
          statusBruto.charAt(0).toUpperCase() +
          statusBruto.slice(1).toLowerCase();
        const statusFinal = CORES_VALIDAS.includes(status) ? status : 'Amarelo';

        if (!nome || !endereco) {
          falhas++;
          setProgresso({ atual: i + 1, total: linhas.length, falhas });
          continue;
        }

        const coords = await geocodificar(endereco);

        try {
          await supabaseFetch('clientes', {
            method: 'POST',
            body: JSON.stringify({
              nome,
              endereco,
              vendedor,
              status_conta: statusFinal,
              lat: coords?.lat || null,
              lng: coords?.lng || null,
            }),
          });
        } catch {
          falhas++;
        }

        setProgresso({ atual: i + 1, total: linhas.length, falhas });
        await esperar(1100);
      }

      setImportando(false);
      await carregar();
      mostrarAviso(
        `Importação concluída! ${
          linhas.length - falhas
        } sucessos, ${falhas} falhas.`,
        'sucesso'
      );
    } catch (e) {
      setImportando(false);
      mostrarAviso('Erro na importação: ' + e.message, 'erro');
    }
  };

  const cancelarImport = () => {
    if (
      confirm(
        'Cancelar importação? Os clientes já importados continuarão salvos.'
      )
    ) {
      cancelarImportRef.current = true;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100dvh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#171717',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Fundo escurecido atrás da gaveta, só no celular */}
      {ehMobile && painelAberto && (
        <div
          onClick={() => setPainelAberto(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 1100,
          }}
        />
      )}

      <div
        style={{
          width: ehMobile ? '86%' : 340,
          maxWidth: 340,
          background: '#fafafa',
          borderRight: '1px solid #e5e5e5',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          ...(ehMobile
            ? {
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: 1200,
                transform: painelAberto ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.25s ease',
                boxShadow: painelAberto ? '0 0 24px rgba(0,0,0,0.25)' : 'none',
              }
            : {}),
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: '1px solid #e5e5e5',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: 'normal',
                color: '#171717',
              }}
            >
              Mapa de Clientes
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
              {clientes.length} clientes cadastrados
            </p>
          </div>
          {ehMobile && (
            <button
              onClick={() => setPainelAberto(false)}
              aria-label="Fechar filtros"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: '#444',
              }}
            >
              <X size={22} />
            </button>
          )}
        </div>

        <div
          style={{
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            borderBottom: '1px solid #e5e5e5',
          }}
        >
          <button onClick={abrirNovo} disabled={importando} style={btnPrimario}>
            <Plus size={16} /> Novo cliente
          </button>
          <label
            style={{
              ...btnSecundario,
              opacity: importando ? 0.5 : 1,
              cursor: importando ? 'not-allowed' : 'pointer',
            }}
          >
            <Upload size={16} /> Importar planilha (.xlsx)
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={importarPlanilha}
              disabled={importando}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {importando && (
          <div
            style={{
              padding: 12,
              background: '#eff6ff',
              borderBottom: '1px solid #bfdbfe',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: '#1e40af',
                marginBottom: 6,
              }}
            >
              <Loader2 size={14} className="spin" /> Importando...
            </div>
            <div style={{ fontSize: 11, color: '#1e40af', marginBottom: 6 }}>
              {progresso.atual} de {progresso.total}{' '}
              {progresso.falhas > 0 && `· ${progresso.falhas} falhas`}
            </div>
            <div
              style={{
                height: 6,
                background: '#dbeafe',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: '#2563eb',
                  width: `${(progresso.atual / progresso.total) * 100}%`,
                  transition: 'width 0.3s',
                }}
              />
            </div>
            <button
              onClick={cancelarImport}
              style={{
                marginTop: 8,
                fontSize: 11,
                color: '#dc2626',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Cancelar
            </button>
          </div>
        )}

        <div
          style={{
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            borderBottom: '1px solid #e5e5e5',
          }}
        >
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{ position: 'absolute', left: 10, top: 10, color: '#999' }}
            />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome..."
              style={{ ...input, paddingLeft: 32 }}
            />
          </div>

          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
          >
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              style={input}
              title="Status"
            >
              <option>Todas</option>
              {CORES_VALIDAS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              value={filtroVendedor}
              onChange={(e) => setFiltroVendedor(e.target.value)}
              style={input}
              title="Vendedor"
            >
              {vendedores.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>

          {/* NOVO DROPDOWN DE ESTADO */}
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            style={input}
            title="Estado"
          >
            {estados.map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </select>
        </div>

        <div
          style={{
            padding: 12,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            borderBottom: '1px solid #e5e5e5',
          }}
        >
          {CORES_VALIDAS.map((c, i) => (
            <ItemLegenda
              key={c}
              cor={c}
              total={contadores[c]}
              aberta={corExplicada === c}
              aoAlternar={setCorExplicada}
              ehMobile={ehMobile}
              alinhar={i % 2 === 1 ? 'direita' : 'esquerda'}
            />
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {carregando ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
              <Loader2 size={20} className="spin" />
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: '#999',
                fontSize: 13,
              }}
            >
              Nenhum cliente
            </div>
          ) : (
            clientesFiltrados.map((c) => (
              <div
                key={c.id}
                onClick={() => selecionarCliente(c, 'lista')}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid #eee',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background:
                    clienteSelecionado?.id === c.id ? '#f0f0f0' : 'transparent',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: CORES[c.status_conta]?.hex || '#999',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: !c.lat || !c.lng ? '#dc2626' : 'inherit',
                    }}
                  >
                    {c.nome}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#888',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.vendedor || '—'}
                  </div>
                </div>

                {(!c.lat || !c.lng) && (
                  <AlertCircle
                    size={14}
                    color="#dc2626"
                    title="Sem localização no mapa"
                  />
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    abrirEdicao(c);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                    color: '#666',
                    display: 'flex',
                  }}
                  title="Editar"
                >
                  <Edit2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={[-15, -54]}
          zoom={4}
          zoomControl={false}
          style={{
            height: '100%',
            width: '100%',
            background: ESTILOS_MAPA[estiloMapa].fundo,
          }}
        >
          {/* à direita para não ficar embaixo do botão de filtros no celular */}
          <ZoomControl position="topright" />
          <EnquadrarBrasil />
          <FundoMapa cor={ESTILOS_MAPA[estiloMapa].fundo} />

          {ESTILOS_MAPA[estiloMapa].semTiles ? (
            <GeoJSON
              key={estiloMapa}
              data={contornoBrasil}
              style={{
                fillColor: ESTILOS_MAPA[estiloMapa].preenchimento,
                fillOpacity: 1,
                color: ESTILOS_MAPA[estiloMapa].borda,
                weight: 1,
              }}
              interactive={false}
            />
          ) : (
            <TileLayer
              key={estiloMapa}
              attribution={ESTILOS_MAPA[estiloMapa].atribuicao}
              url={ESTILOS_MAPA[estiloMapa].url}
            />
          )}
          {clientesFiltrados
            .filter((c) => c.lat && c.lng)
            .map((c) => (
              <Marker
                key={c.id}
                position={[c.lat, c.lng]}
                icon={criarIcone(CORES[c.status_conta]?.hex || '#999')}
                eventHandlers={{ click: () => selecionarCliente(c, 'mapa') }}
              >
                <Popup>
                  <div style={{ minWidth: 200 }}>
                    <div
                      style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}
                    >
                      {c.nome}
                    </div>
                    <div
                      style={{ fontSize: 12, color: '#666', marginBottom: 4 }}
                    >
                      {c.endereco}
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>
                      Vendedor: <b>{c.vendedor || '—'}</b>
                      <br />
                      Status:{' '}
                      <span
                        style={{
                          color: CORES[c.status_conta]?.hex,
                          fontWeight: 600,
                        }}
                      >
                        {c.status_conta}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => abrirEdicao(c)} style={btnPequeno}>
                        <Edit2 size={12} /> Editar
                      </button>
                      <button
                        onClick={() => excluir(c)}
                        style={{ ...btnPequeno, color: '#dc2626' }}
                      >
                        <Trash2 size={12} /> Excluir
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          <CentralizarNoCliente
            cliente={clienteSelecionado}
            origem={origemSelecao}
          />
          <AjustarAoRedimensionar />
        </MapContainer>

        <SeletorEstilo
          estilo={estiloMapa}
          aoEscolher={escolherEstilo}
          aberto={seletorEstiloAberto}
          aoAlternar={setSeletorEstiloAberto}
        />

        {/* Botão de filtros: só no celular, e só quando a gaveta está fechada */}
        {ehMobile && !painelAberto && (
          <button
            onClick={() => setPainelAberto(true)}
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #d4d4d4',
              background: 'white',
              color: '#171717',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            }}
          >
            <SlidersHorizontal size={16} />
            Filtros
            <span style={{ color: '#666', fontWeight: 500 }}>
              ({clientesFiltrados.length})
            </span>
          </button>
        )}

        {aviso && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              padding: '10px 14px',
              borderRadius: 6,
              background:
                aviso.tipo === 'erro'
                  ? '#fee2e2'
                  : aviso.tipo === 'sucesso'
                  ? '#d1fae5'
                  : '#dbeafe',
              color:
                aviso.tipo === 'erro'
                  ? '#991b1b'
                  : aviso.tipo === 'sucesso'
                  ? '#065f46'
                  : '#1e40af',
              fontSize: 13,
              fontWeight: 500,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {aviso.tipo === 'erro' ? (
              <AlertCircle size={16} />
            ) : aviso.tipo === 'sucesso' ? (
              <CheckCircle2 size={16} />
            ) : (
              <Loader2 size={16} className="spin" />
            )}
            {aviso.msg}
          </div>
        )}
      </div>

      {modalAberto && clienteEditando && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 8,
              padding: 24,
              width: 460,
              maxWidth: '90vw',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18 }}>
                {clienteEditando.id ? 'Editar cliente' : 'Novo cliente'}
              </h2>
              <button
                onClick={() => setModalAberto(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Campo label="Nome">
                <input
                  value={clienteEditando.nome}
                  onChange={(e) =>
                    setClienteEditando({
                      ...clienteEditando,
                      nome: e.target.value,
                    })
                  }
                  style={input}
                />
              </Campo>
              <Campo label="Endereço completo">
                <input
                  value={clienteEditando.endereco}
                  onChange={(e) =>
                    setClienteEditando({
                      ...clienteEditando,
                      endereco: e.target.value,
                    })
                  }
                  placeholder="Rua, número, cidade, UF"
                  style={input}
                />
              </Campo>
              <Campo label="Vendedor">
                <input
                  value={clienteEditando.vendedor || ''}
                  onChange={(e) =>
                    setClienteEditando({
                      ...clienteEditando,
                      vendedor: e.target.value,
                    })
                  }
                  style={input}
                />
              </Campo>
              <Campo label="Status da Conta">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {CORES_VALIDAS.map((c) => (
                    <button
                      key={c}
                      onClick={() =>
                        setClienteEditando({
                          ...clienteEditando,
                          status_conta: c,
                        })
                      }
                      style={{
                        padding: '6px 12px',
                        borderRadius: 4,
                        border: '2px solid',
                        borderColor:
                          clienteEditando.status_conta === c
                            ? CORES[c].hex
                            : '#e5e5e5',
                        background:
                          clienteEditando.status_conta === c
                            ? CORES[c].hex
                            : 'white',
                        color:
                          clienteEditando.status_conta === c ? 'white' : '#444',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Campo>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 20,
              }}
            >
              <button
                onClick={() => setModalAberto(false)}
                style={btnSecundario}
              >
                Cancelar
              </button>
              <button onClick={salvar} style={btnPrimario}>
                <Save size={14} /> Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        /* 1. FIX DO MAPA: Impede o Vite de bagunçar os blocos */
        .leaflet-tile {
          position: absolute !important;
        }
        .leaflet-container img {
          max-width: none !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        /* 2. FIX DAS BARRAS LATERAIS: Força o app a ocupar 100% da tela */
        html, body, #root {
          margin: 0 !important;
          padding: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          max-width: none !important;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}

const Campo = ({ label, children }) => (
  <div>
    <label
      style={{
        display: 'block',
        fontSize: 12,
        fontWeight: 600,
        color: '#444',
        marginBottom: 4,
      }}
    >
      {label}
    </label>
    {children}
  </div>
);

const input = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d4d4d4',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const btnPrimario = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 14px',
  background: '#171717',
  color: 'white',
  border: 'none',
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const btnSecundario = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 14px',
  background: 'white',
  color: '#444',
  border: '1px solid #d4d4d4',
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const btnPequeno = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  background: '#f5f5f5',
  border: '1px solid #d4d4d4',
  borderRadius: 3,
  fontSize: 11,
  cursor: 'pointer',
  color: '#171717',
};
