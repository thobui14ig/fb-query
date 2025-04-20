import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Request } from 'express';
import { getUser } from 'src/common/utils/user';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }


  @Get('')
  getUsers() {
    return this.userService.getAll()
  }

  @Get('/info')
  getUserInfo(@Req() req: Request) {
    const response = getUser(req);

    return response
  }

  @Get('/:id')
  getUser(@Param('id') id: number) {
    return this.userService.findById(id)
  }

  @Put()
  updateUser(@Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(updateUserDto)
  }

  @Delete('/:id')
  deleteUser(@Param('id') id: number) {
    return this.userService.delete(id)
  }
}
