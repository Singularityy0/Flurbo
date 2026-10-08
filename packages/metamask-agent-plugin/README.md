# Flurbo MetaMask Agent Wallet plugin

This package registers one read-only `mm flurbo quote` command for a Flurbo pool on Monad testnet. It uses the pool's actual `quoteBuy(uint32,uint256,uint128)` and `quoteSell(uint32,uint256,uint128)` ABI. The TypeScript library also contains holdings reads and a bounded trade helper, but no CLI trade command is registered or verified. See `docs/METROPOLIS_LOCAL_RUNBOOK.md` for installation and test steps.

The CLI command requests no Agent Wallet capabilities. Do not describe it as an autonomous trading plugin until a wallet-submit command is implemented and tested with MetaMask's executor, approval policy, and receipt handling.
