const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const { getConfig } = require('../helper/cache')

const syPoolAPIs = {
  'ethereum': 'https://api-v2.nz.barnbridge.com/api/smartyield/pools',
  'polygon': 'https://prod-poly-v2.api.nz.barnbridge.com/api/smartyield/pools',
}
const saPoolAPIs = {
  'ethereum': 'https://api-v2.nz.barnbridge.com/api/smartalpha/pools',
  'polygon': 'https://prod-poly-v2.api.nz.barnbridge.com/api/smartalpha/pools',
  'avax': 'https://prod-avalanche.api.nz.barnbridge.com/api/smartalpha/pools',
  'arbitrum': 'https://prod-arbitrum.api.nz.barnbridge.com/api/smartalpha/pools',
  'optimism': 'https://prod-optimistic.api.nz.barnbridge.com/api/smartalpha/pools',
  'bsc': 'https://prod-bsc.api.nz.barnbridge.com/api/smartalpha/pools',
}

const STK_AAVE_ADDRESS = '0x4da27a545c0c5b758a6ba100e3a049001de870f5';
const AAVE_ADDRESS = '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9';

async function fetchSyPools(apiUrl, chain) {
  const { data } = await getConfig('barnbridge/sy-'+chain, apiUrl)
  return data
}

async function fetchSaPools(apiUrl, chain) {
  const { data } = await getConfig('barnbridge/sa-'+chain, apiUrl)
  return data
}

function syGetUnderlyingTotal(chain, smartYieldAddress, block) {
  return sdk.api.abi.call({
    abi: {
      name: "underlyingTotal",
      type: "function",
      stateMutability: "view",
      constant: true,
      payable: false,
      inputs: [],
      outputs: [
        {
          name: "total",
          type: "uint256",
          internalType: "uint256",
        },
      ],
    },
    target: smartYieldAddress,
    chain,
    block,
  }).then(({ output }) => new BigNumber(output));
}

function saGetEpochBalance(chain, smartAlphaAddress, block) {
  return sdk.api.abi.call({
    abi: {
      name: "epochBalance",
      type: "function",
      stateMutability: "view",
      constant: true,
      payable: false,
      inputs: [],
      outputs: [
        {
          name: "balance",
          type: "uint256",
          internalType: "uint256",
        },
      ],
    },
    target: smartAlphaAddress,
    chain,
    block,
  }).then(({ output }) => new BigNumber(output));
}

function saGetQueuedJuniorsUnderlyingIn(chain, smartAlphaAddress, block) {
  return sdk.api.abi.call({
    abi: {
      name: "queuedJuniorsUnderlyingIn",
      type: "function",
      stateMutability: "view",
      constant: true,
      payable: false,
      inputs: [],
      outputs: [
        {
          name: "amount",
          type: "uint256",
          internalType: "uint256",
        },
      ],
    },
    target: smartAlphaAddress,
    chain,
    block,
  }).then(({ output }) => new BigNumber(output));
}

function saGetQueuedSeniorsUnderlyingIn(chain, smartAlphaAddress, block) {
  return sdk.api.abi.call({
    abi: {
      name: "queuedSeniorsUnderlyingIn",
      type: "function",
      stateMutability: "view",
      constant: true,
      payable: false,
      inputs: [],
      outputs: [
        {
          name: "amount",
          type: "uint256",
          internalType: "uint256",
        },
      ],
    },
    target: smartAlphaAddress,
    chain,
    block,
  }).then(({ output }) => new BigNumber(output));
}

function resolveAddress(address) {
  switch (address) {
    case STK_AAVE_ADDRESS:
      return AAVE_ADDRESS;
    default:
      return address;
  }
}

module.exports = {
  start: 1615564559, // Mar-24-2021 02:17:40 PM +UTC
  doublecounted: true,
  timetravel: false,
  misrepresentedTokens: true,
  hallmarks: [
    [1612789200, "BOND staking pool end"],
    [1618228800, "Stablecoin pool end"],
    [1617210000, "SMART Yield incentive program start"],
    [1632330000, "SMART Yield incentive program end"],
    [1664193600, "BOND/USDC rewards end"],
  ],
};

const chains = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'bsc', 'avax']

chains.forEach(chain => {
  module.exports[chain] = {
    tvl: async (_, _t, { [chain]: block }) => {
      const balances = {};

      if (syPoolAPIs[chain]) {
        // calculate TVL from SmartYield pools
        const syPools = await fetchSyPools(syPoolAPIs[chain], chain);

        // calculate TVL from SmartYield pools
        await Promise.all(syPools.map(async syPool => {
          const { smartYieldAddress, underlyingAddress } = syPool;
          const underlyingTotal = await syGetUnderlyingTotal(chain, smartYieldAddress, block);

          sdk.util.sumSingleBalance(balances, chain + ':' + resolveAddress(underlyingAddress), underlyingTotal.toFixed(0));
        }));
      };
      if (chain in saPoolAPIs) {
        // calculate TVL from SmartAlpha pools
        const saPools = await fetchSaPools(saPoolAPIs[chain], chain);

        await Promise.all(saPools.map(async saPool => {
          const { poolAddress, poolToken } = saPool;
          const [epochBalance, queuedJuniorsUnderlyingIn, queuedSeniorsUnderlyingIn] = await Promise.all([
            saGetEpochBalance(chain, poolAddress, block),
            saGetQueuedJuniorsUnderlyingIn(chain, poolAddress, block),
            saGetQueuedSeniorsUnderlyingIn(chain, poolAddress, block),
          ]);

          const underlyingTotal = epochBalance
            .plus(queuedJuniorsUnderlyingIn)
            .plus(queuedSeniorsUnderlyingIn);
          sdk.util.sumSingleBalance(balances, chain + ':' + resolveAddress(poolToken.address), underlyingTotal.toFixed(0));
        }));
      };

      return balances;
    }
  }
})