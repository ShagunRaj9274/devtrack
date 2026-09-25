import { Module } from '@nestjs/common';
import { IssuesController, ProjectIssuesController } from './issues.controller';
import { IssuesService } from './issues.service';

@Module({ controllers: [ProjectIssuesController, IssuesController], providers: [IssuesService] })
export class IssuesModule {}
