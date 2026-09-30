import { readPreparationProfile } from './configuration/index.ts';

try {
  readPreparationProfile(process.env);
  process.stdout.write(
    'Hash-Talk: preparação local pronta. Ainda não há aplicação de chat ou serviço de rede.\n',
  );
} catch {
  process.stderr.write(
    'Configuração inválida: use HASH_TALK_PROFILE=development.\n',
  );
  process.exitCode = 1;
}
