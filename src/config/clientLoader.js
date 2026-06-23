// clientLoader.js
// Seleciona o config do cliente com base na variavel de ambiente VITE_CLIENT.
// O Vite resolve isso em TEMPO DE BUILD — nao ha custo de runtime.
// Para adicionar um novo cliente: importe o config aqui e adicione no switch.

import { CLIENT_CONFIG as elcanary } from "./client-elcanary.js";
import { CLIENT_CONFIG as mgt }      from "./client-mgt.js";
import { CLIENT_CONFIG as zendesk }  from "./client-zendesk.js";

const clientId = import.meta.env.VITE_CLIENT || "elcanary";

const configs = { elcanary, mgt, zendesk };

export const CLIENT_CONFIG = configs[clientId] || elcanary;
