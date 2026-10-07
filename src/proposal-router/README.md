# Proposal Router

## Visão Geral

O Proposal Router é um módulo responsável por direcionar propostas aos contratos executores apropriados dentro do ecossistema Ubiquity DAO.

## Funcionalidades

- **Roteamento de Propostas**: Direciona propostas para handlers autorizados
- **Controle de Acesso**: Apenas handlers autorizados podem executar propostas
- **Delay de Segurança**: Período mínimo de 1 dia antes da execução
- **Cancelamento**: Proponentes podem cancelar propostas pendentes
- **Factory Pattern**: Criação de múltiplas instâncias do router

## Estrutura

```
proposal-router/
├── ProposalRouter.sol          # Contrato principal do router
├── ProposalRouterFactory.sol   # Factory para criação de routers
├── IProposalRouter.sol         # Interface do router
├── ProposalRouterLibrary.sol   # Biblioteca de utilitários
├── ProposalRouterTest.t.sol    # Testes do router
├── ProposalRouterFactory.t.sol # Testes da factory
└── README.md                   # Documentação
```

## Uso

### Criando um Router

```solidity
ProposalRouterFactory factory = new ProposalRouterFactory();
address router = factory.createRouter();
```

### Autorizando um Handler

```solidity
ProposalRouter router = ProposalRouter(routerAddress);
router.authorizeHandler(handlerAddress);
```

### Roteando uma Proposta

```solidity
bytes memory data = abi.encodeWithSignature("execute()");
router.routeProposal(handler, data, 0 ether, "Descrição da proposta");
```

### Executando uma Proposta

```solidity
// Aguardar delay mínimo de 1 dia
router.executeProposal(proposalId);
```

## Segurança

- ReentrancyGuard em todas as funções de estado
- Controle de acesso via Ownable e authorizedHandlers
- Validação de endereços
- Delay mínimo de execução

## Testes

```bash
forge test --match-contract ProposalRouterTest
forge test --match-contract ProposalRouterFactoryTest
