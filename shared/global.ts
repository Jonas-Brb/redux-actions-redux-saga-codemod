import * as ts from 'typescript'

import * as utils from './utils'

export const global = {
  DEBUG: false,
  COUNTER_HANDLED: 0,
  COUNTER_SKIPPED: 0,
  importsToAddCache: new utils.Cache<ts.VariableStatement>(),
  importsToRemoveCache: new utils.Cache<ts.Identifier>()
}
