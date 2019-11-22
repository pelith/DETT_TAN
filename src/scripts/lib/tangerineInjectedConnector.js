// customer Connector for web3-vanilla

const { Connector, ErrorCodeMixin, ConnectorArguments } = Web3Vanilla.Connectors

const InjectedConnectorErrorCodes = ['TANGERINE_ACCESS_DENIED', 'LEGACY_PROVIDER', 'NO_WEB3', 'UNLOCK_REQUIRED']
export default class InjectedConnector extends ErrorCodeMixin(Connector, InjectedConnectorErrorCodes) {
  constructor(args = {}) {
    super(args)

    this.runOnDeactivation = []

    this.networkChangedHandler = this.networkChangedHandler.bind(this)
    this.accountsChangedHandler = this.accountsChangedHandler.bind(this)
  }

  async onActivation() {
    const { tangerine, web3 } = window

    if (tangerine) {
      await tangerine.enable().catch(
        (error) => {
          const deniedAccessError = Error(error)
          deniedAccessError.code = InjectedConnector.errorCodes.TANGERINE_ACCESS_DENIED
          throw deniedAccessError
        }
      )

      // initialize event listeners
      if (tangerine.on) {
        tangerine.on('networkChanged', this.networkChangedHandler)
        tangerine.on('accountsChanged', this.accountsChangedHandler)

        this.runOnDeactivation.push(
          () => {
            if (tangerine.removeListener) {
              tangerine.removeListener('networkChanged', this.networkChangedHandler)
              tangerine.removeListener('accountsChanged', this.accountsChangedHandler)
            }
          }
        )
      }

      if (tangerine.isMetaMask) {
        tangerine.autoRefreshOnNetworkChange = false
      }
    } else if (web3) {
      const legacyError = Error('Your web3 provider is outdated, please upgrade to a modern provider.')
      legacyError.code = InjectedConnector.errorCodes.LEGACY_PROVIDER
      throw legacyError
    } else {
      const noWeb3Error = Error('Your browser is not equipped with web3 capabilities.')
      noWeb3Error.code = InjectedConnector.errorCodes.NO_WEB3
      throw noWeb3Error
    }
  }

  async getProvider() {
    const { tangerine } = window
    return tangerine
  }

  async getAccount(provider) {
    const account = super.getAccount(provider)

    if (account === null) {
      const unlockRequiredError = Error('Tangerine account locked.')
      unlockRequiredError.code = InjectedConnector.errorCodes.UNLOCK_REQUIRED
      throw unlockRequiredError
    }

    return account
  }

  onDeactivation() {
    this.runOnDeactivation.forEach((runner) => runner())
    this.runOnDeactivation = []
  }

  // event handlers
  networkChangedHandler(networkId) {
    const networkIdNumber = Number(networkId)

    try {
      super._validateNetworkId(networkIdNumber)

      super._web3UpdateHandler({
        updateNetworkId: true,
        networkId: networkIdNumber
      })
    } catch (error) {
      super._web3ErrorHandler(error)
    }
  }

  accountsChangedHandler(accounts) {
    if (!accounts[0]) {
      const unlockRequiredError = Error('Tangerine account locked.')
      unlockRequiredError.code = InjectedConnector.errorCodes.UNLOCK_REQUIRED
      super._web3ErrorHandler(unlockRequiredError)
    } else {
      super._web3UpdateHandler({
        updateAccount: true,
        account: accounts[0]
      })
    }
  }
}
