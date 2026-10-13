# Correção contextual para desenhos comuns — 13/10/2026

O proprietário pediu corrigir a retenção indevida de um meme com homens vestidos. A reprodução somente desse incidente, original/miniatura com bytes e modelo conferidos, repetiu `hold` pela associação contextual com anatomia/ato explícito; não houve decisão por pose. A outra imagem reportada já estava aprovada. As imagens do incidente não entram no corpus, em Git ou em treinamento; diagnóstico específico permanece somente em `.local/`.

## Correção

Seis descrições gerais de adultos vestidos em cenas cotidianas/desenhos passam a ter categoria própria `ordinary_clothed`. Os vetores FP32 são gerados pelo encoder CLIP já revisado, sem treinamento ou nova dependência, e distribuídos no arquivo de fonte `infra/public-moderation/ordinary_clothed.npy` (12.416 bytes). O SHA-256 é `0e715b0b9d4915fc68b30401a34cfa6de54d40920665672a33dc9529e327a7c6`; manifesto/identidade integral vinculam taxonomia, vetor, runtime e fusão. O artefato de 12 KB inclui somente texto geral, sem imagens de usuários.

As margens anteriores continuam decidindo as duas recusas — anatomia corroborada e consenso de ato sexual efetivo. A categoria nova só participa da avaliação de permissão depois das recusas; nenhuma descrição vestida neutraliza evidência de recusa. Os limites permanecem iguais. Permissão exige concordância de todas as visões e score genérico limitado; valores inválidos, falhas e cobertura incompleta continuam sem aprovação. Pose não decide resultados e a exceção de pinturas sem ato permanece.

Os quatro modelos/artefatos do diretório instalado, incluindo text.npy original, permanecem byte a byte iguais. Os vetores novos ficam na release, carregados com validação de forma, tipo, finitude e norma. Os quatro hashes históricos aceitos ficam preservados na projeção de leituras; a lista é limitada ao atual mais esses quatro, sem aceitar IDs arbitrários. Análises novas exigem aceite privado exato da identidade candidata. O aceite da nova versão não transforma registros antigos retidos em aprovados e não reinicia prazo de sete dias.

## Validação

Original e miniatura do incidente passam com a candidata; o botão TEST conserva allow. No corpus público licenciado anterior, 36 pares de original/miniatura conservam exatamente seus resultados; nove casos válidos com referência proibida continuam restritos e seis referências incertas não são convertidas em aprovações. Um original acima de 2.048 px permanece excluído, sem redução silenciosa. As miniaturas desse ensaio de regressão usam PNG de até 144 px; não são declaração de equivalência byte a byte com toda a cadeia histórica de preparação.

Três desenhos de domínio público escolhidos após congelar as descrições foram retidos pela baseline e aprovados pela candidata, em original/miniatura: [The Passing of the Growler](https://commons.wikimedia.org/wiki/File:The-passing-of-the-growler-Punch-1907.png), [Credo Experto](<https://commons.wikimedia.org/wiki/File:Credo_Experto_-_Cartoon_for_Punch_(28_November_1896)_-_Edward_Linley_Sambourne_-_ABDAG003894.jpg>) e [Ramsay MacDonald](https://commons.wikimedia.org/wiki/File:Ramsay_MacDonald_-_Punch_cartoon_-_Project_Gutenberg_eText_17629.png). Autores, publicação, fonte, representação exata e hashes ficam em `.local/`. A representação de Ramsay MacDonald é a imagem inteira em 960 px fornecida pelo site; não é o original de 2.533 px. Só inferência própria/offline; nenhum texto/arquivo do app foi enviado a terceiros.

Testes de regra cobrem a correção de cena vestida, preservação da recusa de anatomia/ato, divergência entre visões, score genérico elevado e nova categoria inválida. A verificação completa de código e banco/executor continua exigida para integração. Esses conjuntos pequenos medem regressão e melhoria qualitativa em desenhos; não estabelecem taxa populacional ou garantem ausência de falso positivo futuro.

## Reprodução e ativação

`infra/moderation-evaluation/encode_ordinary_context.py --encoder DIRETORIO --output ARQUIVO.npy` reconstrói os seis vetores sem imagens, usando o ambiente Python de pesquisa já existente e os arquivos fixados da revisão `1a25a446712ba5ee05982a381eed697ef9b435cf` de `laion/CLIP-ViT-B-32-laion2B-s34B-b79K`. O script verifica os hashes de pesos, configuração e tokenizer, proíbe rede e exige igualdade byte a byte com o artefato da fonte. Não instala pacotes no runtime nem concede aceite de modelo.

**Ponto importante:** a correção está local até aprovação/ativação da identidade integral do detector. Publicar somente pela main integrada/enviada, CI integral e executor vigente, com os serviços/configurações do outro projeto preservados. Não substituir os modelos compartilhados nem os pacotes instalados. Preparar o aceite novo como próximo hash, mantendo a lista histórica e a configuração anterior para rollback; conferir identidade/prontidão depois. A liberação do registro antigo é uma revisão específica e não efeito automático deste lote.
