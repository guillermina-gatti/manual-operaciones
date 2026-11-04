// Módulo del chat (contrato simulado de HU17). Registrar en app.module.ts en "imports".
import { Module } from '@nestjs/common';
import { ChatSimulatedController } from './chat.simulated.controller';

@Module({
    controllers: [ChatSimulatedController],
})
export class ChatModule { }