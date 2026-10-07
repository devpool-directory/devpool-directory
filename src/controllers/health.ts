import { Request, Response } from 'express';

export const healthCheck = async (req: Request, res: Response) => {
  try {
    // Aqui podemos adicionar verificações de banco de dados ou serviços externos
    const healthStatus = {
      status: 'UP',
      timestamp: new Date().toISOString(),
      plugins: {
        github: 'connected',
        database: 'connected'
      }
    };

    return res.status(200).json(healthStatus);
  } catch (error) {
    return res.status(500).json({
      status: 'DOWN',
      error: 'Service unavailable'
    });
  }
};
