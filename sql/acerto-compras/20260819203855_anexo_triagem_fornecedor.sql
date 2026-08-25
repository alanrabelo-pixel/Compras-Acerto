-- Categoria de anexo para a evidência da triagem básica do fornecedor.
-- Aditivo: só acrescenta um valor ao enum, nada existente é alterado.
ALTER TYPE "AttachmentCategory" ADD VALUE IF NOT EXISTS 'TRIAGEM_FORNECEDOR';
